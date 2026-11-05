import com.google.gson.*;
import common.CommonStatic;
import common.battle.data.*;
import common.battle.BasisSet;
import common.battle.Treasure;
import common.io.assets.AssetLoader;
import common.pack.*;
import common.system.VImg;
import common.system.fake.ImageBuilder;
import common.system.files.VFile;
import common.util.anim.*;
import common.util.Data;
import common.util.lang.ProcLang;
import common.util.lang.Formatter;
import common.util.pack.Background;
import common.util.pack.EffAnim;
import common.util.pack.Soul;
import common.util.stage.*;
import common.util.unit.*;
import main.MainBCU;
import utilpc.awt.FIBI;
import utilpc.UtilPC;
import utilpc.Interpret;

import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;

/** Build-time only: reads the user's installed BCU, never calls desktop startup/update/save. */
public final class ExportBcu {
    static final Gson JSON = new GsonBuilder().disableHtmlEscaping().create();
    static Path install, output;
    static final List<Map<String,Object>> resources = new ArrayList<>();
    static long resourceBytes;
    static int stageCount;
    static final Map<String,String[]> unitNames = new HashMap<>(), unitDescriptions = new HashMap<>();
    static final Map<String,String> enemyNames = new HashMap<>(), enemyDescriptions = new HashMap<>(), stageNames = new HashMap<>();

    static class ReadOnlyContext extends MainBCU.AdminContext {
        @Override public File getBCUFolder() { return install.toFile(); }
        @Override public boolean confirmDelete() { return false; }
        @Override public boolean confirmDelete(File f) { return false; }
        @Override public void initProfile() { throw new UnsupportedOperationException("Exporter owns initialization"); }
        @Override public void noticeErr(Exception e, Context.ErrType type, String message) {
            throw new IllegalStateException(message, e);
        }
        @Override public void printErr(Context.ErrType type, String message) { System.err.println(type + ": " + message); }
        @Override public void loadProg(String text) { System.out.println(text); }
    }

    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless", "true");
        if (args.length != 2) throw new IllegalArgumentException("Usage: ExportBcu <BCU installation> <web output>");
        install = Paths.get(args[0]).toAbsolutePath().normalize();
        output = Paths.get(args[1]).toAbsolutePath().normalize();
        if (output.startsWith(install)) throw new IllegalArgumentException("Output must be outside the BCU installation");
        Files.createDirectories(output.resolve("data"));
        UserProfile.profile();
        CommonStatic.ctx = new ReadOnlyContext();
        CommonStatic.def = new CommonStatic.Itf() {
            public void save(boolean save, boolean exit) { throw new UnsupportedOperationException("Read only"); }
            public long getMusicLength(Music f) { return 0; }
            public File route(String p) { return install.resolve(p).toFile(); }
            public void setSE(int id) { }
            public void setSE(Identifier<Music> id) { }
            public void setBGM(Identifier<Music> id) { }
        };
        ImageBuilder.builder = FIBI.builder;
        MainBCU.builder = FIBI.builder;
        CommonStatic.getConfig().lang = CommonStatic.Lang.Locale.EN;
        CommonStatic.getConfig().prefLevel = 50;
        System.out.println("Reading installed asset archives...");
        AssetLoader.load(p -> {});
        System.out.println("Loading original BCU data...");
        UserProfile.getBCData().load(System.out::println, p -> {});
        Treasure treasures = BasisSet.current().t();
        readNames();
        Map<String,Object> catalog = obj("schemaVersion", 1, "version", "0-5-8-8", "source", "BCU/BCU-0-5-8-8.jar", "fps", 30);
        List<Object> units = new ArrayList<>(), enemies = new ArrayList<>(), collections = new ArrayList<>(), backgrounds = new ArrayList<>(), castles = new ArrayList<>(), music = new ArrayList<>(), effects = new ArrayList<>(), souls = new ArrayList<>();
        for (Unit u : UserProfile.getBCData().units.getList()) {
            if (u == null) continue;
            List<Object> forms = new ArrayList<>();
            for (Form f : u.forms) {
                if (f == null) continue;
                Map<String,Object> form = stats(f.du);
                form.putAll(obj("id", u.id.id, "fid", f.fid, "name", formText(unitNames, u.id.id, f.fid, f.toString()), "description", formText(unitDescriptions, u.id.id, f.fid, ""), "price", f.du.getPrice(), "respawn", f.du.getRespawn(), "animation", animation(f.anim), "icon", saveIcon(f.anim.getUni(), "unit-" + trio(u.id.id) + "-" + f.fid), "editorIcon", imagePath(f.anim.getEdi())));
                // Match UnitListTable.get() exactly: preferred level, max talents, default max treasure, no combos.
                MaskUnit maxData = f.maxu();
                int preferredLevel = u.getPreferredLevel();
                double levelMultiplier = u.lv.getMult(preferredLevel);
                int interval = maxData.getItv();
                form.put("display", obj("level", preferredLevel, "hp", (int)(maxData.getHp()*levelMultiplier*treasures.getDefMulti()), "attack", (int)(Math.round(maxData.allAtk()*levelMultiplier)*treasures.getAtkMulti()), "dps", interval == 0 ? 0 : (int)(maxData.allAtk()*levelMultiplier*treasures.getAtkMulti()*30/interval), "kb", maxData.getHb(), "range", maxData.getRange(), "speed", maxData.getSpeed(), "attackInterval", interval, "foreswing", maxData.rawAtkData()[0][1], "respawn", treasures.getFinRes(maxData.getRespawn(),0), "price", f.getDefaultPrice(1), "will", maxData.getWill()+1));
                form.put("maxStats", stats(maxData));
                forms.add(form);
            }
            units.add(obj("id", u.id.id, "rarity", u.rarity, "max", u.max, "maxPlus", u.maxp, "levelCurve", u.lv == null ? null : u.lv.lvs, "forms", forms));
        }
        for (Enemy e : UserProfile.getBCData().enemies.getList()) {
            if (e == null) continue;
            Map<String,Object> enemy = stats(e.de);
            enemy.putAll(obj("id", e.id.id, "name", enemyNames.getOrDefault(trio(e.id.id), e.toString()), "description", enemyDescriptions.getOrDefault(trio(e.id.id), ""), "inDictionary", e.inDic, "drop", e.de.getDrop(), "displayDrop", Math.floor(e.de.getDrop()*treasures.getDropMulti())/100, "star", e.de.getStar(), "animation", animation(e.anim), "icon", saveIcon(e.getIcon(), "enemy-" + trio(e.id.id))));
            enemies.add(enemy);
        }
        for (MapColc mc : MapColc.values()) {
            List<Object> maps = new ArrayList<>();
            String runtimeId = mc.getSID();
            String cid = runtimeId.matches("\\d+") ? trio(Integer.parseInt(runtimeId)) : runtimeId;
            for (StageMap sm : mc.maps.getList()) {
                if (sm == null) continue;
                String mid = cid + "-" + trio(sm.id.id);
                List<Object> stages = new ArrayList<>();
                for (Stage st : sm.list.getList()) {
                    if (st == null) continue;
                    String sid = mid + "-" + trio(st.id.id);
                    List<Object> lines = new ArrayList<>();
                    if (st.data != null && st.data.datas != null) for (SCDef.Line line : st.data.datas) {
                        Map<String,Object> l = primitiveFields(line);
                        l.put("enemy", line.enemy == null ? -1 : line.enemy.id);
                        lines.add(l);
                    }
                    Map<String,Object> stage = primitiveFields(st);
                    stage.putAll(obj("id", sid, "sid", st.id.id, "name", stageNames.getOrDefault(sid, st.toString()), "background", id(st.bg), "background1", id(st.bg1), "castle", id(st.castle), "music", id(st.mus0), "music1", id(st.mus1), "lines", lines));
                    if (st.info != null) stage.put("info", primitiveFields(st.info));
                    stages.add(stage);
                    stageCount++;
                }
                maps.add(obj("id", mid, "sid", sm.id.id, "name", stageNames.getOrDefault(mid, sm.toString()), "stars", sm.stars, "price", sm.price, "stages", stages));
            }
            collections.add(obj("id", cid, "runtimeId", runtimeId, "name", stageNames.getOrDefault(cid, mc.toString()), "maps", maps));
        }
        for (Background bg : UserProfile.getBCData().bgs.getList()) {
            if (bg == null) continue;
            Map<String,Object> b = primitiveFields(bg);
            b.putAll(obj("id", bg.id.id, "name", bg.toString(), "image", imagePath(bg.img), "colors", bg.cs, "imgcut", bg.ic));
            backgrounds.add(b);
        }
        for (Map.Entry<String,CastleList> entry : CastleList.map().entrySet()) for (CastleImg castle : entry.getValue().getList()) {
            if (castle == null) continue;
            castles.add(obj("id", castle.id.id, "collection", entry.getKey(), "name", castle.toString(), "bossSpawn", castle.boss_spawn, "image", imagePath(castle.img)));
        }
        try (var files = Files.list(install.resolve("assets/music"))) {
            for (Path file : files.sorted().toList()) if (file.toString().endsWith(".ogg")) {
                String fileName = file.getFileName().toString();
                music.add(obj("id", Integer.parseInt(fileName.substring(0,3)), "name", fileName, "url", "assets/music/" + fileName));
            }
        }
        for (EffAnim<?> effect : CommonStatic.getBCAssets().effas.values()) {
            if (effect == null) continue;
            int effectId = effects.size();
            effect.check();
            String prefix = "assets/effects/" + trio(effectId);
            Path base = output.resolve(prefix);
            Files.createDirectories(base.getParent());
            ImageIO.write((BufferedImage)effect.getNum().bimg(), "png", Paths.get(base + ".png").toFile());
            try (PrintStream stream = new PrintStream(base + ".imgcut", StandardCharsets.UTF_8)) { effect.imgcut.write(stream); }
            try (PrintStream stream = new PrintStream(base + ".mamodel", StandardCharsets.UTF_8)) { effect.mamodel.write(stream); }
            List<String> animationPaths = new ArrayList<>();
            List<String> names = new ArrayList<>();
            for (int i=0;i<effect.anims.length;i++) {
                String path = prefix + "-" + i + ".maanim";
                try (PrintStream stream = new PrintStream(output.resolve(path).toString(), StandardCharsets.UTF_8)) { effect.anims[i].write(stream); }
                animationPaths.add(path);
                names.add(String.valueOf(effect.types[i]));
            }
            effects.add(obj("id", effectId, "name", effect.toString(), "types", names, "animation", obj("prefix",prefix,"sprite",prefix+".png","imgcut",prefix+".imgcut","mamodel",prefix+".mamodel","maanim",animationPaths)));
        }
        for (Soul soul : UserProfile.getBCData().souls.getList()) if (soul != null) souls.add(obj("id", soul.getID().id, "name", soul.toString(), "animation", animation(soul.anim)));
        catalog.putAll(obj("units", units, "enemies", enemies, "collections", collections, "backgrounds", backgrounds, "castles", castles, "music", music, "effects", effects, "souls", souls));
        List<Object> unitLevels = new ArrayList<>();
        for (UnitLevel curve : UserProfile.getBCData().unitLevels.getList()) if(curve!=null) unitLevels.add(obj("id",curve.id.id,"lvs",curve.lvs));
        catalog.put("unitLevels",unitLevels);
        catalog.put("procDefaults",JSON.toJsonTree(Data.Proc.blank()));
        addMetadata(catalog);
        writeJson(output.resolve("data/catalog.json"), catalog);
        System.out.printf("Catalog: %d units, %d enemies, %d stages, %d backgrounds, %d castles, %d music tracks%n", units.size(), enemies.size(), stageCount, backgrounds.size(), castles.size(), music.size());
        System.out.println("Exporting original virtual asset tree...");
        copyTree(VFile.getBCFileTree());
        copyDirectory(install.resolve("assets/music"), output.resolve("assets/music"));
        copyDirectory(install.resolve("assets/fonts"), output.resolve("assets/fonts"));
        copyDirectory(install.resolve("assets/lang"), output.resolve("assets/lang"));
        writeJson(output.resolve("data/resources.json"), obj("count", resources.size(), "bytes", resourceBytes, "files", resources));
        System.out.printf("Exported %d virtual resources (%d bytes)%n", resources.size(), resourceBytes);
    }

    static Map<String,Object> stats(MaskEntity m) {
        List<Integer> traits = new ArrayList<>();
        for (Trait t : m.getTraits()) traits.add(t.id.id);
        Map<String,Object> out = obj("hp", m.getHp(), "attack", m.allAtk(), "kb", m.getHb(), "range", m.getRange(), "speed", m.getSpeed(), "attackInterval", m.getItv(), "tba", m.getTBA(), "post", m.getPost(), "attackCount", m.getAtkCount(), "ability", m.getAbi(), "width", m.getWidth(), "area", m.isRange(), "longDistance", m.isLD(), "omni", m.isOmni(), "traits", traits, "rawAttacks", m.rawAtkData(), "will", m.getWill()+1, "attackLoop", m.getAtkLoop(), "hasRevenge", m.getRevenge()!=null, "hasResurrection",m.getResurrection()!=null);
        if (m instanceof MaskUnit u) out.putAll(obj("limit",u.getLimit(),"back",u.getBack(),"front",u.getFront()));
        else if (m instanceof MaskEnemy e) out.put("limit", e.getLimit());
        out.put("procs", m.getProc().serProc());
        List<Object> attackRanges = new ArrayList<>();
        for (int ai=0;ai<m.getAtkCount();ai++) {
            MaskAtk attack=m.getAtkModel(ai);
            attackRanges.add(obj("shortPoint",attack.getShortPoint(),"longPoint",attack.getLongPoint(),"omni",attack.getLongPoint()<attack.getShortPoint()));
        }
        out.put("touchBase",m.touchBase());out.put("attackRanges",attackRanges);
        List<Object> procDisplay = new ArrayList<>();
        boolean isEnemy = m instanceof MaskEnemy;
        int level = 1; double magnification = 1;
        if (m instanceof MaskUnit u && u.getPack() != null) {
            Unit unit = u.getPack().unit;
            level = unit.getPreferredLevel() + unit.getPreferredPlusLevel();
            magnification = unit.lv.getMult(level);
        }
        Formatter.Context frames = new Formatter.Context(isEnemy,false,new double[]{magnification,level});
        Formatter.Context seconds = new Formatter.Context(isEnemy,true,new double[]{magnification,level});
        Field[] procFields = Data.Proc.getDeclaredFields();
        for (int i=0;i<procFields.length;i++) try {
            Data.Proc.ProcItem item = (Data.Proc.ProcItem)procFields[i].get(m.getProc());
            if (!item.exists()) continue;
            String key = procFields[i].getName();
            ProcLang.ItemLang language = ProcLang.get().get(key);
            if (language.format != null) procDisplay.add(obj("key",key,"text",Formatter.format(language.format,item,frames),"secondsText",Formatter.format(language.format,item,seconds),"icon",i<66?"assets/icons/proc-"+key+".png":null));
        } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
        out.put("procDisplay",procDisplay);
        return out;
    }

    static Map<String,Object> animation(AnimU<?> anim) throws Exception {
        String prefix = String.valueOf(field(anim, "str"));
        List<String> maanims = new ArrayList<>();
        for (String suffix : new String[]{".maanim", "00.maanim", "01.maanim", "02.maanim", "03.maanim", "_entry.maanim", "_zombie00.maanim", "_zombie01.maanim", "_zombie02.maanim"}) if (VFile.get(prefix + suffix) != null) maanims.add(url(prefix + suffix));
        return obj("prefix", url(prefix), "sprite", url(prefix + ".png"), "imgcut", url(prefix + ".imgcut"), "mamodel", url(prefix + ".mamodel"), "maanim", maanims);
    }

    static Object field(Object object, String name) throws Exception {
        for (Class<?> c = object.getClass(); c != null; c = c.getSuperclass()) try {
            Field f = c.getDeclaredField(name); f.setAccessible(true); return f.get(object);
        } catch (NoSuchFieldException ignored) { }
        return null;
    }
    static String imagePath(VImg img) throws Exception {
        if (img == null) return null;
        VFile file = (VFile) field(img, "file");
        return file == null ? null : url(file.getPath());
    }
    static String saveIcon(VImg img, String name) throws Exception {
        if (img == null) return null;
        String path = "assets/icons/" + name + ".png";
        Path destination = output.resolve(path);
        if (!Files.exists(destination)) {
            Files.createDirectories(destination.getParent());
            ImageIO.write((BufferedImage) img.getImg().bimg(), "png", destination.toFile());
        }
        img.unload();
        return path;
    }
    static String saveBufferedIcon(BufferedImage image, String name) throws IOException {
        if (image == null) return null;
        String path = "assets/icons/" + name + ".png";
        Path destination = output.resolve(path);
        Files.createDirectories(destination.getParent());
        ImageIO.write(image,"png",destination.toFile());
        return path;
    }
    static void addMetadata(Map<String,Object> catalog) throws Exception {
        Map<String,Object> procs = new LinkedHashMap<>();
        Field[] procFields = Data.Proc.getDeclaredFields();
        for (int i=0;i<procFields.length;i++) {
            String key = procFields[i].getName();
            ProcLang.ItemLang lang = ProcLang.get().get(key);
            procs.put(key, obj("id",i,"name",lang.full_name,"abbr",lang.abbr_name,"description",lang.tooltip,"format",lang.format,"icon",saveBufferedIcon(runtimeIcon(1,i),"proc-"+key)));
        }
        List<Object> traitMetadata = new ArrayList<>(), abilityMetadata = new ArrayList<>(), attackMetadata = new ArrayList<>();
        List<String> traitIcons = new ArrayList<>(), abilityIcons = new ArrayList<>(), attackIcons = new ArrayList<>();
        for (int i=0;i<Interpret.TRAIT.length;i++) {
            String icon = saveBufferedIcon(runtimeIcon(3,i),"trait-"+i);
            traitIcons.add(icon); traitMetadata.add(obj("id",i,"name",Interpret.TRAIT[i],"icon",icon));
        }
        for (int i=0;i<Interpret.ABIS.length;i++) {
            String icon = saveBufferedIcon(runtimeIcon(0,i),"ability-"+i);
            abilityIcons.add(icon); abilityMetadata.add(obj("id",i,"name",Interpret.ABIS[i],"abbr",Interpret.SABIS[i],"icon",icon));
        }
        for (int i=0;i<Interpret.ATKCONF.length;i++) {
            String icon = saveBufferedIcon(runtimeIcon(2,i),"attack-"+i);
            attackIcons.add(icon); attackMetadata.add(obj("id",i,"name",Interpret.ATKCONF[i],"icon",icon));
        }
        catalog.putAll(obj("procMetadata",procs,"traits",traitMetadata,"abilities",abilityMetadata,"attackTypes",attackMetadata,"traitIcons",traitIcons,"abilityIcons",abilityIcons,"attackIcons",attackIcons));
        List<Integer> treasureValues = new ArrayList<>();
        Treasure treasure = BasisSet.current().t();
        for (int index : Interpret.TIND) treasureValues.add(Interpret.getValue(index,treasure));
        catalog.put("treasureValues",treasureValues);
    }
    static BufferedImage runtimeIcon(int type, int id) {
        try { return UtilPC.getIcon(type,id); } catch (IndexOutOfBoundsException e) { return null; }
    }
    static Map<String,Object> primitiveFields(Object object) {
        Map<String,Object> out = new LinkedHashMap<>();
        for (Field f : object.getClass().getFields()) {
            if (Modifier.isStatic(f.getModifiers())) continue;
            Class<?> t = f.getType();
            if (t.isPrimitive() || t == String.class || t == int[].class || t == int[][].class) try { out.put(f.getName(), f.get(object)); } catch (ReflectiveOperationException ignored) { }
        }
        return out;
    }
    static int id(Identifier<?> id) { return id == null ? -1 : id.id; }
    static String trio(int n) { return String.format(java.util.Locale.ROOT, "%03d", n); }
    static String url(String path) { return "assets/" + path.replace('\\','/').replaceFirst("^\\./", ""); }
    static Map<String,Object> obj(Object... pairs) {
        Map<String,Object> map = new LinkedHashMap<>();
        for (int i=0; i<pairs.length; i+=2) map.put(String.valueOf(pairs[i]), pairs[i+1]);
        return map;
    }
    static void writeJson(Path path, Object value) throws IOException {
        Files.createDirectories(path.getParent());
        Path temporary=path.resolveSibling(path.getFileName()+".tmp");
        try (Writer w = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8)) { JSON.toJson(value, w); }
        Files.move(temporary,path,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
    }
    static void readNames() throws IOException {
        Path locale = install.resolve("assets/lang/en");
        readFormNames(locale.resolve("UnitName.txt"), unitNames);
        readFormNames(locale.resolve("UnitExplanation.txt"), unitDescriptions);
        readSimpleNames(locale.resolve("EnemyName.txt"), enemyNames);
        readSimpleNames(locale.resolve("EnemyExplanation.txt"), enemyDescriptions);
        readSimpleNames(locale.resolve("StageName.txt"), stageNames);
    }
    static void readFormNames(Path path, Map<String,String[]> target) throws IOException {
        for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
            String[] parts = line.split("\\t", -1);
            if (parts.length > 1) target.put(parts[0].trim(), Arrays.copyOfRange(parts,1,parts.length));
        }
    }
    static void readSimpleNames(Path path, Map<String,String> target) throws IOException {
        for (String line : Files.readAllLines(path, StandardCharsets.UTF_8)) {
            String[] parts = line.split("\\t", -1);
            if (parts.length < 2) continue;
            for (int i=1;i<parts.length;i++) if (!parts[i].isBlank()) { target.put(parts[0].trim(), parts[i]); break; }
        }
    }
    static String formText(Map<String,String[]> values, int id, int form, String fallback) {
        String[] parts = values.get(trio(id));
        return parts != null && form < parts.length && !parts[form].isBlank() ? parts[form] : fallback;
    }
    static void copyTree(VFile file) throws IOException {
        if (file.getData() != null) {
            String resourceUrl = url(file.getPath());
            Path destination = output.resolve(resourceUrl).normalize();
            if (!destination.startsWith(output.resolve("assets"))) throw new IOException("Unsafe asset path: " + resourceUrl);
            Files.createDirectories(destination.getParent());
            int size = file.getData().size();
            if (!Files.exists(destination) || Files.size(destination) != size) try (InputStream in = file.getData().getStream()) { Files.copy(in, destination, StandardCopyOption.REPLACE_EXISTING); }
            resources.add(obj("path",resourceUrl,"size",size));
            resourceBytes += size;
            if (resources.size() % 10000 == 0) System.out.println("Exported " + resources.size() + " resources");
        } else for (VFile child : file.list()) copyTree(child);
    }
    static void copyDirectory(Path source, Path target) throws IOException {
        if (!Files.exists(source)) return;
        try (var walk = Files.walk(source)) {
            for (Path p : walk.toList()) if (Files.isRegularFile(p)) {
                Path dest = target.resolve(source.relativize(p)); Files.createDirectories(dest.getParent());
                if (!Files.exists(dest) || Files.size(dest) != Files.size(p)) Files.copy(p,dest,StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }
}
