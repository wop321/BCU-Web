import common.CommonStatic;
import common.io.PackLoader;
import common.pack.UserProfile;
import java.nio.file.*;
import java.util.Arrays;

public class VerifyNativePack {
  public static void main(String[] args) throws Exception {
    UserProfile.profile();ExportBcu.install=Paths.get(args[0]);CommonStatic.ctx=new ExportBcu.ReadOnlyContext();
    PackLoader.ZipDesc pack=PackLoader.readPack(fd->false,Paths.get(args[1]).toFile());
    if(!pack.matchKey("test-password"))throw new AssertionError("Password hash mismatch");
    int checked=0;
    for(PackLoader.ZipDesc.FileDesc file:pack.files){
      byte[] bytes;try(var input=pack.readFile(file.path)){bytes=input.readAllBytes();}
      Path expected=Paths.get(args[2]).resolve(file.path.replaceFirst("^\\./",""));
      if(Files.exists(expected)&&!Arrays.equals(bytes,Files.readAllBytes(expected)))throw new AssertionError("Changed file: "+file.path);
      if(file.path.equals("./trailing.bin")&&!Arrays.equals(bytes,new byte[]{1,2,0,0}))throw new AssertionError("Trailing zeros lost");
      if(bytes.length!=file.size)throw new AssertionError("Wrong size: "+file.path);
      checked++;
    }
    System.out.println("Original Java PackLoader verified "+checked+" browser-exported native files; pack="+pack.desc.id);
  }
}
