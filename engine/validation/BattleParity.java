import common.CommonStatic;
import common.battle.*;
import common.battle.entity.Entity;
import common.io.assets.AssetLoader;
import common.pack.*;
import common.system.fake.ImageBuilder;
import common.util.stage.*;
import common.util.unit.*;
import main.MainBCU;
import utilpc.awt.FIBI;
import com.google.gson.GsonBuilder;
import java.io.File;
import java.nio.file.*;
import java.util.*;

/** JVM golden trace from original BCU classes, with no browser adapters or alternate simulation. */
public final class BattleParity {
    public static void main(String[] args)throws Exception{
        System.setProperty("java.awt.headless","true");
        ExportBcu.install=Paths.get(args[0]).toAbsolutePath().normalize();
        UserProfile.profile();CommonStatic.ctx=new ExportBcu.ReadOnlyContext();
        CommonStatic.def=new CommonStatic.Itf(){
            public void save(boolean save,boolean exit){}
            public long getMusicLength(Music music){return 0;}
            public File route(String path){return ExportBcu.install.resolve(path).toFile();}
            public void setSE(int id){}
            public void setSE(Identifier<Music> id){}
            public void setBGM(Identifier<Music> id){}
        };
        ImageBuilder.builder=FIBI.builder;MainBCU.builder=FIBI.builder;
        CommonStatic.getConfig().lang=CommonStatic.Lang.Locale.EN;
        CommonStatic.getConfig().performanceModeBattle=false;
        CommonStatic.getConfig().twoRow=true;
        CommonStatic.getConfig().buttonDelay=false;
        AssetLoader.load(value->{});UserProfile.getBCData().load(value->{},value->{});
        BasisLU lineup=new BasisLU();
        for(int i=0;i<3;i++){
            Unit unit=UserProfile.getBCData().units.get(i);lineup.lu.fs[0][i]=unit.forms[0];
            Level level=unit.getPrefLvs();level.setLevel(20);level.setPlusLevel(0);lineup.lu.setLv(unit,level);
        }
        lineup.lu.renew();
        Stage stage=MapColc.get("000003").maps.get(0).list.get(0);
        SBCtrl battle=new SBCtrl(new CommonStatic.FakeKey(){public boolean pressed(int i,int j){return false;}public void remove(int i,int j){}},stage,0,lineup,new int[]{0,0,0,0},12345);
        List<Object> trace=new ArrayList<>();trace.add(snapshot(battle.sb));
        for(int frame=1;frame<=1200;frame++){
            if(frame>=301&&frame%60==1)battle.action.add(0);
            if(frame>=361&&frame%120==1)battle.action.add(1);
            if(frame==401)battle.action.add(-1);
            if(frame==801)battle.action.add(-2);
            battle.update();
            if(frame%300==0)trace.add(snapshot(battle.sb));
        }
        Files.writeString(Paths.get(args[1]),new GsonBuilder().setPrettyPrinting().create().toJson(trace));
        System.out.println("Original JVM trace written: "+trace.size()+" snapshots, "+battle.sb.time+" frames");
    }
    static Object snapshot(StageBasis state){
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("frame",state.time);result.put("money",state.getMoney());result.put("maxMoney",state.getMaxMoney());result.put("workerLevel",state.work_lv);result.put("cannon",state.cannon);result.put("maxCannon",state.maxCannon);result.put("enemyHealth",state.ebase.health);result.put("catHealth",state.ubase.health);
        List<Object> entities=new ArrayList<>();for(Entity entity:state.le)if(!entity.dead){Map<String,Object> row=new LinkedHashMap<>();row.put("direction",entity.dire);row.put("position",entity.pos);row.put("health",entity.health);row.put("maxHealth",entity.maxH);row.put("layer",entity.currentLayer);entities.add(row);}result.put("entities",entities);
        return result;
    }
}
