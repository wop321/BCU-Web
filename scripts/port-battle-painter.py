"""Retain BCU's Java battle painter, replacing only desktop boundary types."""
from pathlib import Path
import re
root = Path(__file__).resolve().parent.parent
source = (root/'upstream/BCU-java-PC/src/main/java/page/battle/BattleBox.java').read_text(encoding='utf-8')
source = source.replace('package page.battle;', 'package bcu.web;')
source = re.sub(r'^import (?:main\.|page\.|utilpc\.|java\.awt\.|java\.io\.File).*;\s*$', '', source, flags=re.M)
source = source.replace('public interface BattleBox', 'public interface BrowserBattlePainter')
source = re.sub(r'\bBattleBox\b', 'BrowserBattlePainter', source)
source = re.sub(r'\bPoint\b', 'P', source).replace('new PP(p)', 'new P(p.x, p.y)')
source = source.replace('interface OuterBox extends RetFunc', 'interface OuterBox')
start = source.index('\tclass StageNamePainter {')
end = source.index('\n\tinterface OuterBox', start)
replacement = '''\tclass StageNamePainter {
        // Text rasterization uses the original stage font through Canvas.
        private final FakeImage img;
        StageNamePainter(String text) { img = make(text); }
        @org.teavm.jso.JSBody(params="text", script="const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.font='bold 42px BcuStage, sans-serif';const w=g.measureText(text).width;g.save();g.translate(3,44);g.scale(Math.min(1,228/Math.max(1,w)),1);g.lineWidth=8;g.lineJoin='round';g.strokeStyle='black';g.strokeText(text,0,0);const a=g.createLinearGradient(0,-42,0,0);a.addColorStop(0,'#fff500');a.addColorStop(1,'#ec9c00');g.fillStyle=a;g.fillText(text,0,0);g.restore();return c;")
        private static native org.teavm.jso.JSObject raster(String text);
        private static FakeImage make(String text) { return new CanvasImage(raster(text)); }
    }
'''
source = source[:start]+replacement+source[end:]
source = source.replace('private synchronized void press(P p)', 'public synchronized void press(P p)').replace('private synchronized void wheeled(P p, int ind)', 'public synchronized void wheeled(P p, int ind)')
source = source.replace('protected synchronized void drag(P p, int button)', 'public synchronized void drag(P p, int button)').replace('protected synchronized void release()', 'public synchronized void release()')
header = '''/* Browser adaptation of BCU page.battle.BattleBox and BBCtrl.
 * Battle geometry, sprites, damage effects, HUD and hit testing remain upstream Java.
 * Desktop Point is replaced by common.system.P; stage-name text uses Canvas.
 */
'''
target = root/'engine/src/main/java/bcu/web/BrowserBattlePainter.java'
target.write_text(header+source, encoding='utf-8')
print(target)
controls = (root/'upstream/BCU-java-PC/src/main/java/page/battle/BBCtrl.java').read_text(encoding='utf-8')
controls = controls.replace('package page.battle;', 'package bcu.web;')
controls = re.sub(r'^import (?:main\.|page\.|utilpc\.|java\.awt\.).*;\s*$', '', controls, flags=re.M)
controls = controls.replace('public class BBCtrl extends BBPainter', 'public class BrowserBattleControls extends BrowserBattlePainter.BBPainter')
controls = controls.replace('public BBCtrl(OuterBox bip, SBCtrl bas, BattleBox bb)', 'public BrowserBattleControls(BrowserBattlePainter.OuterBox bip, SBCtrl bas, BrowserBattlePainter bb)')
controls = re.sub(r'\bPoint\b', 'P', controls).replace('new PP(p)', 'new P(p.x, p.y)')
controls = controls.replace('MouseEvent.BUTTON1', '1').replace('MainBCU.clickWithinDragWindow', 'true')
controls = controls.replace('protected synchronized void release()', 'public synchronized void release()').replace('protected synchronized void drag(P p, int button)', 'public synchronized void drag(P p, int button)')
controls = controls.replace('int totalDrag = Math.abs(dragInit.x - dragEnd.x) + Math.abs(dragInit.y - dragEnd.y);', 'float totalDrag = Math.abs(dragInit.x - dragEnd.x) + Math.abs(dragInit.y - dragEnd.y);')
controls = controls.replace('int dragButton;', 'int dragButton = 1;')
controls = controls.replace('private boolean isInDragRange', 'private boolean isInDragRange')
(target.parent/'BrowserBattleControls.java').write_text(header+controls, encoding='utf-8')
