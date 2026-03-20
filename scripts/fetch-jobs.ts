import axios from 'axios';

const BASE_URL = 'https://jobs.enlite.health';

interface JobPost {
  id: number;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  date: string;
  slug: string;
  status: string;
  type: string;
  meta?: Record<string, string>;
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url: string;
    }>;
  };
}

async function fetchJobs(): Promise<void> {
  console.log('🚀 Buscando vagas da API WordPress...\n');

  const jobTypes = [
    { slug: 'vagas_br', name: 'Português (BR)' },
    { slug: 'vagas_en', name: 'Inglês (EN)' },
    { slug: 'vagas_ar', name: 'Espanhol (AR)' }
  ];

  for (const jobType of jobTypes) {
    console.log(`\n📍 Testando /wp-json/wp/v2/${jobType.slug}`);
    console.log(`   Idioma: ${jobType.name}`);
    
    try {
      const res = await axios.get(`${BASE_URL}/wp-json/wp/v2/${jobType.slug}`, {
        params: {
          per_page: 100,
          _embed: true
        }
      });

      const jobs: JobPost[] = res.data;
      
      console.log(`✅ ${jobs.length} vagas encontradas`);
      
      if (jobs.length > 0) {
        console.log('\n📝 Primeiras 3 vagas:');
        jobs.slice(0, 3).forEach((job, idx) => {
          console.log(`\n   ${idx + 1}. ID: ${job.id}`);
          console.log(`      Título: ${job.title.rendered}`);
          console.log(`      Slug: ${job.slug}`);
          console.log(`      Data: ${job.date}`);
          console.log(`      Excerpt: ${job.excerpt.rendered.substring(0, 100)}...`);
          
          // Verificar se há meta campos
          if (job.meta && Object.keys(job.meta).length > 0) {
            console.log(`      Meta:`, job.meta);
          }
        });

        // Analisar estrutura da primeira vaga completa
        console.log('\n🔍 Estrutura completa da primeira vaga:');
        const firstJob = jobs[0];
        console.log('   Campos disponíveis:', Object.keys(firstJob));
        
        // Mostrar content para ver se há dados estruturados
        console.log('\n   Content HTML (primeiros 500 chars):');
        console.log(firstJob.content.rendered.substring(0, 500));
      }

    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        console.log(`❌ Erro ${err.response?.status}: ${err.message}`);
        if (err.response?.data) {
          console.log('   Detalhes:', err.response.data);
        }
      } else {
        console.log('❌ Erro desconhecido:', err);
      }
    }
  }

  console.log('\n✨ Busca completa!\n');
}

// Executar
fetchJobs().catch(console.error);
