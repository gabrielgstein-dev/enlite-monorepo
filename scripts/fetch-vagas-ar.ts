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
}

async function fetchArgentinianJobs(): Promise<void> {
  console.log('🚀 Buscando vagas da Argentina (vagas_ar)...\n');
  
  try {
    const res = await axios.get(`${BASE_URL}/wp-json/wp/v2/vagas_ar`, {
      params: {
        per_page: 5,
        _fields: 'id,title,slug,content,meta,acf'
      }
    });

    const jobs: JobPost[] = res.data;
    
    console.log(`✅ ${jobs.length} vagas encontradas\n`);
    
    if (jobs.length > 0) {
      console.log('📝 Primeiras 5 vagas:\n');
      jobs.forEach((job, idx) => {
        console.log(`\n${idx + 1}. ID: ${job.id}`);
        console.log(`   Título: ${job.title?.rendered || 'N/A'}`);
        console.log(`   Slug: ${job.slug || 'N/A'}`);
        console.log(`   Content: ${job.content?.rendered?.substring(0, 200) || 'N/A'}...`);
        
        // Verificar meta e ACF
        if (job.meta && Object.keys(job.meta).length > 0) {
          console.log(`   Meta:`, JSON.stringify(job.meta, null, 2));
        }
      });

      // Mostrar objeto completo da primeira vaga
      console.log('\n\n🔍 Objeto completo da primeira vaga:');
      console.log(JSON.stringify(jobs[0], null, 2));
    }

  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.log(`❌ Erro ${err.response?.status}: ${err.message}`);
      if (err.response?.data) {
        console.log('Detalhes:', err.response.data);
      }
    } else {
      console.log('❌ Erro desconhecido:', err);
    }
  }

  console.log('\n✨ Busca completa!\n');
}

// Executar
fetchArgentinianJobs().catch(console.error);
