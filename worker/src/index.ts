export default { async fetch(): Promise<Response> { return new Response("Livo edge worker is online."); } } satisfies ExportedHandler;
