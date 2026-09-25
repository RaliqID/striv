package com.raliq.striv;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which runs on a device or emulator.
 *
 * Verifies the app is installed under the expected application id — Capacitor's
 * template ships this asserting "com.getcapacitor.app", which fails for any app
 * that changed its id.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.raliq.striv", appContext.getPackageName());
    }
}
