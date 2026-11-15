import {defineConfig} from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  site:"https://posetek.net", srcDir:"./player-signin-astro", publicDir:"./astro/public", outDir:"./player-signin-dist",
  output:"static", build:{format:"preserve",assets:"_astro",inlineStylesheets:"never"},
  integrations:[react(),{name:"canonical-player-signin-dev-route",hooks:{"astro:server:setup":({server})=>{
    server.middlewares.use((request,_response,next)=>{const url=new URL(request.url||"/","http://localhost");if(url.pathname==="/signin")request.url="/player-signin"+url.search;next();});
  }}}],
  vite:{envPrefix:["PUBLIC_"],plugins:[tailwindcss()],build:{chunkSizeWarningLimit:1500}},devToolbar:{enabled:false},
});
