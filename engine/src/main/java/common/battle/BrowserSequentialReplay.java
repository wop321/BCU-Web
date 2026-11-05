package common.battle;

import common.util.stage.Replay;

/** Uses the original replay action reader for forward playback without reflective snapshots. */
public final class BrowserSequentialReplay extends Mirror {
    public BrowserSequentialReplay(Replay replay) {
        super(replay);
    }
}
