const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    extraResource: [
      './public'
    ],
    ignore: [
      /^\/out\//,
      /^\/\.git\//,
      /^\/node_modules\/(?!electron)/,
      /^\/create-icon\.html$/,
      /^\/create-icns\.html$/,
      /^\/assets\/icon\.iconset\//,
      /^\/assets\/icon\.svg$/,
      /\.md$/,
      /\.log$/,
      /\.gitignore$/,
      /package-lock\.json$/,
      /^\/\.vscode\//,
      /^\/\.DS_Store$/,
      /\.map$/
    ],
    prune: true,
    electronVersion: require('electron/package.json').version
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        compression: 'maximum'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  hooks: {
    generateAssets: async () => {
      const { execSync } = require('child_process');
      console.log('Building CSS...');
      execSync('npm run build-css', { stdio: 'inherit' });
    }
  },
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
