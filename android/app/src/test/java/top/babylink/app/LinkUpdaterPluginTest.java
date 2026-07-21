package top.babylink.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class LinkUpdaterPluginTest {
    @Test
    public void acceptsIntegerAndLongVersionCodes() {
        assertEquals(13L, LinkUpdaterPlugin.versionCodeFromPluginValue(Integer.valueOf(13)));
        assertEquals(13L, LinkUpdaterPlugin.versionCodeFromPluginValue(Long.valueOf(13L)));
    }

    @Test
    public void rejectsInvalidVersionCodes() {
        assertEquals(0L, LinkUpdaterPlugin.versionCodeFromPluginValue(null));
        assertEquals(0L, LinkUpdaterPlugin.versionCodeFromPluginValue("13"));
        assertEquals(0L, LinkUpdaterPlugin.versionCodeFromPluginValue(Double.valueOf(13.5)));
        assertEquals(0L, LinkUpdaterPlugin.versionCodeFromPluginValue(Integer.valueOf(0)));
    }
}