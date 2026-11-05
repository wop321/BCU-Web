import common.CommonStatic;
import common.pack.UserProfile;
import main.MainBCU;
import page.*;
import sun.misc.Unsafe;
import javax.imageio.ImageIO;
import javax.swing.*;
import javax.swing.plaf.FontUIResource;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Offscreen original Swing render: no native window, startup, updater, or Robot. */
public final class SnapshotUi {
    static JRootPane root;
    public static class FrameStub extends MainFrame {
        private FrameStub() { super("Unused"); }
        @Override public JRootPane getRootPane() { return root; }
    }
    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless","true");
        int width = args.length>2?Integer.parseInt(args[2]):1280;
        int height = args.length>3?Integer.parseInt(args[3]):720;
        Path install = Paths.get(args[0]);
        UserProfile.profile();
        ExportBcu.install = install;
        CommonStatic.ctx = new ExportBcu.ReadOnlyContext();
        CommonStatic.getConfig().lang = CommonStatic.Lang.Locale.EN;
        MainBCU.light = true; MainBCU.nimbus = false;
        Field uf = Unsafe.class.getDeclaredField("theUnsafe"); uf.setAccessible(true);
        Unsafe unsafe = (Unsafe)uf.get(null);
        root = new JRootPane(); root.setSize(width,height);
        MainFrame.F = (FrameStub) unsafe.allocateInstance(FrameStub.class);
        int fontSize = Math.min(24*width/2300,24*height/1300);
        MainFrame.font = new Font("Dialog",Font.PLAIN,fontSize);
        FontUIResource resource = new FontUIResource(MainFrame.font);
        for (Object key : Collections.list(UIManager.getDefaults().keys())) if (UIManager.get(key) instanceof FontUIResource) UIManager.put(key,resource);
        for (String section : new String[]{"page","info","util"}) {
            Path file = install.resolve("assets/lang/en/"+section+".properties");
            MainLocale locale = new MainLocale(section+"_en");
            for(String line:Files.readAllLines(file,StandardCharsets.UTF_8)) {
                String[] p = line.split("[=\\t]",2);
                if(p.length==2) locale.res.put(p[0],p[1]);
            }
        }
        MainPage main = new MainPage();
        main.componentResized(width,height);
        Method renew = MainPage.class.getDeclaredMethod("renew");renew.setAccessible(true);renew.invoke(main);
        JMenuBar bar = new JMenuBar();bar.add(new JMenu("File"));bar.add(new JMenu("History"));
        bar.setSize(width,22);bar.doLayout();
        JPanel scene = new JPanel(null);scene.setBackground(Color.WHITE);scene.setSize(width,height+22);
        scene.add(bar);bar.setBounds(0,0,width,22);scene.add(main);main.setBounds(0,22,width,height);
        BufferedImage image = new BufferedImage(width,height+22,BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();scene.printAll(graphics);graphics.dispose();
        Path destination = Paths.get(args[1]); Files.createDirectories(destination.toAbsolutePath().getParent());
        ImageIO.write(image,"png",destination.toFile());
        System.out.println("Original Swing MainPage rendered to "+destination+" (panel "+width+"x"+height+", menu22px)");
    }
}
