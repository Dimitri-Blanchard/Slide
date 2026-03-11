package com.slide.messenger;

import android.os.Bundle;
import android.webkit.WebSettings;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge-to-edge: content draws behind status/nav bars, use safe-area in CSS
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WebSettings webSettings = getBridge().getWebView().getSettings();
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
