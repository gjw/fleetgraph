module.exports = {
  apps: [
    {
      name: 'ship-api',
      cwd: './api',
      script: 'dist/index.js',
      env: {
        PORT: 3000,
        FLEETGRAPH_URL: 'http://127.0.0.1:3100',
      },
    },
    {
      name: 'ship-web',
      cwd: './web',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --port 4173 --host 127.0.0.1',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'fleetgraph',
      cwd: './fleetgraph',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
