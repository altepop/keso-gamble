// WebKit uses the real SDK bundle, with only Discord's native host and wallet replies simulated.
// CDP-only touch-hold checks remain in the Chromium suite; taps and authentication run here on WebKit.
const {execFileSync}=require('node:child_process');
// Negative control uses the actual affected frontend, not a reimplementation of its imports.
execFileSync(process.execPath,['scripts/discord-auth-browser-check.cjs','guild-touch'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSER:'webkit',KESO_TEST_REV:'0bbf0af',KESO_MIXED_CASINO:'1',KESO_EXPECT_LEGACY_FAILURE:'1'}});
for(const scenario of ['dm-touch','guild-touch','cancel','unconfigured','config-failure','slow-config','module-failure']){
 execFileSync(process.execPath,['scripts/discord-auth-browser-check.cjs',scenario],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSER:'webkit'}});
}
execFileSync(process.execPath,['scripts/discord-auth-browser-check.cjs','guild-touch'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSER:'webkit',KESO_MIXED_CASINO:'1'}});
