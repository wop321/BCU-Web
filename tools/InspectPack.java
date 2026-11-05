import common.CommonStatic;
import common.pack.*;
import common.io.json.JsonEncoder;
import common.util.stage.*;
import common.battle.data.*;
import common.util.anim.AnimCE;
import common.util.unit.*;
import common.io.PackLoader;
import common.io.assets.AssetLoader;
import common.system.fake.ImageBuilder;
import utilpc.awt.FIBI;
import java.nio.file.*;

public class InspectPack {
  public static void main(String[] args) throws Exception {
    UserProfile.profile();ExportBcu.install=Paths.get(args[0]);CommonStatic.ctx=new ExportBcu.ReadOnlyContext();
    PackData.UserPack pack=new PackData.UserPack("abcdef");
    pack.desc.author="";pack.desc.names.put("New pack");pack.desc.desc="";
    System.out.println(JsonEncoder.encode(pack));
    System.out.println("CUSTOM_ENEMY="+JsonEncoder.encode(new CustomEnemy()));
    System.out.println("CUSTOM_UNIT="+JsonEncoder.encode(new CustomUnit()));
    if(args.length>1) {
      ImageBuilder.builder=FIBI.builder;AssetLoader.load(p->{});UserProfile.getBCData().load(s->{},p->{});
      UserProfile.profile().packmap.put(pack.desc.id,pack);
      AnimCE animation=new AnimCE(new Source.ResourceLocation(pack.desc.id,"fixture",Source.BasePath.ANIM));
      Enemy enemy=new Enemy(new Identifier<>(pack.desc.id,AbEnemy.class,0),animation,new CustomEnemy());enemy.names.put("Fixture Enemy");pack.enemies.add(enemy);
      Unit unit=new Unit(new Identifier<>(pack.desc.id,Unit.class,0),animation,new CustomUnit());unit.forms[0].names.put("Fixture Unit");pack.units.add(unit);
      StageMap map=new StageMap(pack.mc.getNextID());pack.mc.maps.add(map);Stage stage=new Stage(map);map.list.add(stage);new common.util.stage.info.CustomStageInfo(stage);
      stage.bg=Identifier.parseInt(0,common.util.pack.Background.class);stage.castle=Identifier.parseInt(0,CastleImg.class);stage.mus0=Identifier.parseInt(0,Music.class);
      stage.data=new SCDef(1);stage.data.datas[0]=new SCDef.Line();stage.data.datas[0].enemy=enemy.id;stage.data.datas[0].multiple=100;stage.data.datas[0].mult_atk=100;
      Path out=Paths.get(args[1]);Files.createDirectories(out);Files.writeString(out.resolve("pack.json"),JsonEncoder.encode(pack).toString());
      Path animationDir=out.resolve("animations/fixture");Files.createDirectories(animationDir);
      Path raw=Paths.get(args[0]).getParent().resolve("web/assets/org/unit/000/f");
      String[] from={"000_f.png","000_f.imgcut","000_f.mamodel","000_f00.maanim","000_f01.maanim","000_f02.maanim","000_f03.maanim","edi000_f.png","uni000_f00.png"};
      String[] to={"sprite.png","imgcut.txt","mamodel.txt","maanim_walk.txt","maanim_idle.txt","maanim_attack.txt","maanim_kb.txt","icon_display.png","icon_deploy.png"};
      for(int i=0;i<from.length;i++)Files.copy(raw.resolve(from[i]),animationDir.resolve(to[i]),StandardCopyOption.REPLACE_EXISTING);
      PackLoader.writePack(out.resolveSibling("fixture.pack.bcuzip").toFile(),out.toFile(),pack.desc,"test-password",p->{});
      System.out.println("Fixture saved: "+out);
    }
  }
}
