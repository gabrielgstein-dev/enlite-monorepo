import { JobScraperService } from '../src/infrastructure/scraper/JobScraperService';

async function testScraper(): Promise<void> {
  console.log('🚀 Testando scraper com paginação...\n');
  
  const scraper = new JobScraperService();
  
  try {
    const jobs = await scraper.scrapeJobs();
    console.log(`\n✅ Total de vagas coletadas: ${jobs.length}`);
    
    if (jobs.length > 0) {
      console.log('\n📝 Primeiras 3 vagas:');
      jobs.slice(0, 3).forEach((job, idx) => {
        console.log(`\n${idx + 1}. Código ${job.code}: ${job.provincia} - ${job.localidad}`);
      });
    }
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

testScraper();
