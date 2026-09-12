/**
 * Ejemplo de PM2 para una app consumidora de HL Console.
 * Las variables viven aqui (o en el entorno del sistema), no en un .env en disco.
 *
 *   pm2 start ecosystem.config.js --env production
 *
 * Este archivo tampoco se versiona: agregalo a .gitignore y deja
 * ecosystem.config.example.js como plantilla sin valores.
 */
module.exports = {
  apps: [
    {
      name: 'mi-app',
      script: 'server.js',
      env_production: {
        NODE_ENV: 'production',
        HL_URL: 'http://127.0.0.1:3056',
        HL_KEY: 'hl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        HL_SECRET: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        HL_AGENTE: 'a7385432-c888-426b-9f2b-35d981ccad78',
        HL_TTL_MIN: '30',
      },
    },
  ],
};
