package it.abacozuzzurellone.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup.MarginLayoutParams;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Apps targeting SDK 36 are always drawn edge-to-edge (the opt-out flag is ignored): the page would
        // slide under the status and navigation bars. Go edge-to-edge on every Android version, so they all
        // behave the same, and keep the game in its own area by giving the WebView margins as wide as the bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // Behind the bars: black, like the classic system bars the app had before (white icons, see styles.xml)
        findViewById(android.R.id.content).setBackgroundColor(Color.BLACK);

        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            // The keyboard (ime) counts too: edge-to-edge, the window no longer shrinks for it by itself,
            // and it would cover the guess field. Each side takes the largest of the three.
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime()
            );
            MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = insets.left;
            mlp.topMargin = insets.top;
            mlp.rightMargin = insets.right;
            mlp.bottomMargin = insets.bottom;
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });

        hideSystemBars();
    }

    // Immersive mode: the game takes the whole screen, status and navigation bars hidden.
    // A swipe from the edge shows them for a moment, over the game; they hide again by themselves.
    // Hidden bars report no insets, so the margins above leave only the camera cutout and the keyboard.
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    // Back from another app, or a system popup closed: the bars may have come back, hide them again
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }
}
