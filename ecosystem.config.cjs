module.exports = {
  apps: [
    {
      name: 'alena-informes',
      cwd: '/home/proderi-informes/htdocs/informes.proderi.com',
      script: 'npm',
      args: 'run start',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '3346',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      merge_logs: true,
    },
  ],
};
