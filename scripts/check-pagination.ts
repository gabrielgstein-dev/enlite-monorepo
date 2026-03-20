import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://jobs.enlite.health/es/';

async function checkPagination(): Promise<void> {
  console.log('🔍 Analisando estrutura do site de vagas...\n');
  
  try {
    const res = await axios.get(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    
    // Contar total de vagas
    const totalVagas = $('.accordion').length;
    console.log(`📊 Total de vagas na página: ${totalVagas}`);
    
    // Verificar paginação
    const paginationElements = [
      '.pagination', '.page-numbers', '.nav-links', 
      '[class*="page"]', '[class*="pagin"]', 
      '.load-more', '#load-more', '[class*="load"]' ,
      '.next', '.prev', '.older', '.newer'
    ];
    
    console.log('\n🔎 Verificando elementos de paginação:');
    let foundPagination = false;
    
    for (const selector of paginationElements) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`   ✅ ${selector}: encontrado (${elements.length} elementos)`);
        console.log(`      Texto: "${elements.first().text().trim().substring(0, 50)}"`);
        foundPagination = true;
      }
    }
    
    if (!foundPagination) {
      console.log('   ❌ Nenhum elemento de paginação encontrado');
    }
    
    // Verificar se há scripts de lazy load/infinite scroll
    console.log('\n📝 Verificando scripts:');
    const scripts = $('script');
    let foundLazyLoad = false;
    
    scripts.each((_, script) => {
      const src = $(script).attr('src') || '';
      const content = $(script).html() || '';
      
      if (src.includes('lazy') || src.includes('infinite') || src.includes('ajax')) {
        console.log(`   📌 Script externo: ${src}`);
        foundLazyLoad = true;
      }
      
      if (content.includes('infiniteScroll') || 
          content.includes('loadMore') || 
          content.includes('ajax') ||
          content.includes('fetch') && content.includes('vagas')) {
        console.log(`   📌 Script inline com lazy load/ajax detectado`);
        foundLazyLoad = true;
      }
    });
    
    if (!foundLazyLoad) {
      console.log('   ℹ️  Nenhum script de lazy load detectado');
    }
    
    // Verificar se há filtro/pesquisa que carrega vagas dinamicamente
    console.log('\n🎛️  Verificando filtros:');
    const filters = ['#fav-filters', '#searchInput', '.search-filter', '.row-filters'];
    for (const selector of filters) {
      const el = $(selector);
      if (el.length > 0) {
        console.log(`   ✅ ${selector}: encontrado`);
      }
    }
    
    // Verificar se o #fav-results tem todas as vagas
    const favResults = $('#fav-results');
    if (favResults.length > 0) {
      const vagasNoContainer = favResults.find('.accordion').length;
      console.log(`\n📦 Vagas dentro de #fav-results: ${vagasNoContainer}`);
    }
    
    // Tentar verificar se há mais páginas via ?page=2
    console.log('\n🌐 Testando paginação via URL:');
    try {
      const page2Res = await axios.get(`${BASE_URL}?page=2`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const $page2 = cheerio.load(page2Res.data);
      const vagasPage2 = $page2('.accordion').length;
      
      if (vagasPage2 > 0) {
        console.log(`   ✅ Página 2 tem ${vagasPage2} vagas`);
        console.log(`   📊 Total estimado: ${totalVagas + vagasPage2}+ vagas`);
      } else {
        console.log(`   ❌ Página 2 não tem vagas (404 ou sem conteúdo)`);
        console.log(`   📊 Total real: ${totalVagas} vagas (sem paginação)`);
      }
    } catch (err) {
      console.log(`   ❌ Erro ao acessar página 2: ${err}`);
    }

    console.log('\n✨ Análise completa!\n');
    
  } catch (err) {
    console.error('❌ Erro:', err);
  }
}

checkPagination().catch(console.error);
