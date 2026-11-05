"""Adapt the supplied BCU GIF encoder's pixel boundary to browser Canvas."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
source=(root/'upstream/BCU-java-PC/src/main/java/res/AnimatedGifEncoder.java').read_text(encoding='utf-8')
source=source.replace('package res;', '''package bcu.web;
import res.NeuQuant;
import org.teavm.jso.JSObject;
import org.teavm.jso.JSBody;
import org.teavm.jso.typedarrays.Uint8ClampedArray;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.Map;
import java.util.HashMap;''')
source=re.sub(r'^import (?:java\.awt\.|java\.io\.(?:BufferedOutputStream|FileOutputStream)).*;\s*$', '', source, flags=re.M)
source=source.replace('public class AnimatedGifEncoder {','public class BrowserGifEncoder {')
source=re.sub(r'\bBufferedImage\b','JSObject',source)
source=re.sub(r'\bColor\b','Integer',source)
source=source.replace('im.getWidth()', 'canvasWidth(im)').replace('im.getHeight()', 'canvasHeight(im)')
source=source.replace('c.getRed()', '(c >> 16) & 255').replace('c.getGreen()', '(c >> 8) & 255').replace('c.getBlue()', 'c & 255')
start=source.index('\tpublic boolean start(String file) {')
end=source.index('\n\t/**',start)
source=source[:start]+source[end:]
start=source.index('\tprotected void getImagePixels() {')
end=source.index('\n\t/**',start)
source=source[:start]+'''    @JSBody(params="canvas",script="return canvas.width;")
    private static native int canvasWidth(JSObject canvas);
    @JSBody(params="canvas",script="return canvas.height;")
    private static native int canvasHeight(JSObject canvas);
    @JSBody(params={"canvas","width","height"},script="return canvas.getContext('2d').getImageData(0,0,width,height).data;")
    private static native Uint8ClampedArray rgba(JSObject canvas,int width,int height);
    protected void getImagePixels() {
        Uint8ClampedArray rgba = rgba(image,width,height);
        pixels = new byte[width * height * 3];
        for (int i=0,j=0;i<width*height;i++) {
            int alpha=rgba.get(i*4+3);
            pixels[j++]=(byte)((rgba.get(i*4+2)*alpha+127)/255);
            pixels[j++]=(byte)((rgba.get(i*4+1)*alpha+127)/255);
            pixels[j++]=(byte)((rgba.get(i*4)*alpha+127)/255);
        }
    }
''' + source[end:]
pos=source.index('\n\tprotected int width;')
source=source[:pos]+'''
    private static final Map<Integer,BrowserGifEncoder> encoders=new HashMap<>();
    private static int nextId=1;
    private ByteArrayOutputStream buffer;
    static int create(int width,int height,int fps) {
        if(width<1||height<1||width>8192||height>8192||fps<1||fps>120)throw new IllegalArgumentException("Invalid GIF dimensions or frame rate");
        BrowserGifEncoder encoder=new BrowserGifEncoder();
        encoder.buffer=new ByteArrayOutputStream();encoder.setSize(width,height);encoder.setFrameRate(fps);encoder.setRepeat(0);
        if(!encoder.start(encoder.buffer))throw new IllegalStateException("Cannot start GIF encoder");
        int id=nextId++;encoders.put(id,encoder);return id;
    }
    static void frame(int id,JSObject canvas) {
        BrowserGifEncoder encoder=encoders.get(id);if(encoder==null)throw new IllegalArgumentException("Unknown GIF encoder");
        if(canvasWidth(canvas)!=encoder.width||canvasHeight(canvas)!=encoder.height)throw new IllegalArgumentException("GIF frame dimensions changed");
        if(!encoder.addFrame(canvas))throw new IllegalStateException("Could not encode GIF frame");
    }
    static String complete(int id) {
        BrowserGifEncoder encoder=encoders.remove(id);if(encoder==null)throw new IllegalArgumentException("Unknown GIF encoder");
        if(encoder.firstFrame)throw new IllegalStateException("GIF has no frames");
        if(!encoder.finish())throw new IllegalStateException("Could not finish GIF");
        return Base64.getEncoder().encodeToString(encoder.buffer.toByteArray());
    }
    static void cancel(int id) { encoders.remove(id); }
''' + source[pos:]
dest=root/'engine/src/main/java/bcu/web'
(dest/'BrowserGifEncoder.java').write_text(source,encoding='utf-8')
lzw=(root/'upstream/BCU-java-PC/src/main/java/res/LZWEncoder.java').read_text(encoding='utf-8').replace('package res;','package bcu.web;')
(dest/'LZWEncoder.java').write_text(lzw,encoding='utf-8')
print('Adapted original GIF quantizer and encoder')
