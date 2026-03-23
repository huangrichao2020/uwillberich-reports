module.exports = {
  apps: [{
    name: 'uwillberich-reports',
    script: 'server.js',
    cwd: '/root/uwillberich-reports',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/root/uwillberich-reports/logs/error.log',
    out_file: '/root/uwillberich-reports/logs/out.log',
    log_file: '/root/uwillberich-reports/logs/combined.log',
    time: true
  }]
};
