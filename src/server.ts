import { createApp } from './http/app.js';

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => {
  console.log(`API de Agenda de Visitas ouvindo em http://localhost:${port}`);
});
