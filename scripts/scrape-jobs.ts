import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://jobs.enlite.health/es/';

interface ScrapedJob {
  code: string;
  title: string;
  workerType: string;
  provincia: string;
  localidad: string;
  workerSex: string;
  pathologies: string;
  description: string;
  service: string;
  daysAndHours: string;
  ageRange: string;
  profile: string;
}

async function scrapeJobs(): Promise<void> {
  console.log('🕷️  Scraping vagas do HTML...\n');
  
  try {
    const res = await axios.get(BASE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(res.data);
    
    // Procurar botões de accordion (cada um é uma vaga)
    const jobs: ScrapedJob[] = [];
    
    $('.accordion').each((idx, elem) => {
      const $btn = $(elem);
      const $panel = $btn.next('.panel');
      
      // Extrair dados do data attributes
      const job: ScrapedJob = {
        code: $btn.attr('data-code') || '',
        title: $btn.text().trim(),
        workerType: $btn.attr('data-worker-type') || '',
        provincia: $btn.attr('data-provincia') || '',
        localidad: $btn.attr('data-localidad') || '',
        workerSex: $btn.attr('data-worker-sex') || '',
        pathologies: $btn.attr('data-pathologies') || '',
        description: $btn.attr('data-description') || '',
        service: $btn.attr('data-service') || '',
        daysAndHours: '',
        ageRange: '',
        profile: ''
      };
      
      // Extrair mais dados do panel (HTML interno)
      $panel.find('p').each((_, p) => {
        const text = $(p).text();
        if (text.includes('Días y Horarios:')) {
          job.daysAndHours = text.replace('Días y Horarios:', '').trim();
        } else if (text.includes('Franja Etaria:')) {
          job.ageRange = text.replace('Franja Etaria:', '').trim();
        } else if (text.includes('Perfil Buscado:')) {
          job.profile = text.replace('Perfil Buscado:', '').trim();
        }
      });
      
      if (job.code) {
        jobs.push(job);
      }
    });

    console.log(`✅ ${jobs.length} vagas encontradas\n`);
    
    if (jobs.length > 0) {
      console.log('📝 Primeiras 3 vagas:\n');
      jobs.slice(0, 3).forEach((job, idx) => {
        console.log(`${idx + 1}. Código: ${job.code}`);
        console.log(`   Título: ${job.title}`);
        console.log(`   Tipo: ${job.workerType}`);
        console.log(`   Local: ${job.localidad}, ${job.provincia}`);
        console.log(`   Sexo: ${job.workerSex}`);
        console.log(`   Patologia: ${job.pathologies}`);
        console.log(`   Serviço: ${job.service}`);
        console.log(`   Horários: ${job.daysAndHours}`);
        console.log(`   Idade: ${job.ageRange}`);
        console.log(`   Perfil: ${job.profile}`);
        console.log(`   Descrição: ${job.description?.substring(0, 100)}...`);
        console.log('');
      });

      // Mostrar JSON completo da primeira
      console.log('\n🔍 JSON completo da primeira vaga:');
      console.log(JSON.stringify(jobs[0], null, 2));
    }

  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.log(`❌ Erro ${err.response?.status}: ${err.message}`);
    } else {
      console.log('❌ Erro:', err);
    }
  }

  console.log('\n✨ Scraping completo!\n');
}

// Executar
scrapeJobs().catch(console.error);
