import axios from 'axios';

const BASE_URL = 'https://jobs.enlite.health';

async function discoverEndpoints(): Promise<void> {
  console.log('🔍 Descobrindo endpoints da API WordPress...\n');

  // 1. Listar tipos de posts disponíveis
  console.log('1️⃣ Testando /wp-json/wp/v2/types');
  try {
    const typesRes = await axios.get(`${BASE_URL}/wp-json/wp/v2/types`);
    console.log('✅ Tipos encontrados:', Object.keys(typesRes.data));
    console.log('');
  } catch (err: unknown) {
    console.log('❌ Erro:', err instanceof Error ? err.message : 'Unknown error');
  }

  // 2. Tentar endpoints comuns de vagas
  const commonSlugs = ['job', 'vaga', 'vacancy', 'jobs', 'vagas', 'position', 'vacantes'];

  console.log('2️⃣ Testando slugs comuns:\n');
  for (const slug of commonSlugs) {
    try {
      const res = await axios.get(`${BASE_URL}/wp-json/wp/v2/${slug}`);
      console.log(`✅ /${slug}: ENCONTRADO (${res.data.length} itens)`);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : '?';
      console.log(`❌ /${slug}: ${status === 404 ? 'Não existe' : `Erro ${status}`}`);
    }
  }

  // 3. Listar categorias
  console.log('\n3️⃣ Testando /wp-json/wp/v2/categories');
  try {
    const catsRes = await axios.get(`${BASE_URL}/wp-json/wp/v2/categories`);
    console.log('✅ Categorias encontradas:');
    catsRes.data.forEach((cat: { id: number; name: string; slug: string }) => {
      console.log(`   - ID ${cat.id}: ${cat.name} (${cat.slug})`);
    });
  } catch (err: unknown) {
    console.log('❌ Erro:', err instanceof Error ? err.message : 'Unknown error');
  }

  // 4. Tentar posts comuns
  console.log('\n4️⃣ Testando /wp-json/wp/v2/posts');
  try {
    const postsRes = await axios.get(`${BASE_URL}/wp-json/wp/v2/posts`, {
      params: { per_page: 5 }
    });
    console.log(`✅ Posts encontrados: ${postsRes.data.length}`);
    postsRes.data.forEach((post: { id: number; title: { rendered: string }; type: string }) => {
      console.log(`   - ID ${post.id}: ${post.title.rendered} [${post.type}]`);
    });
  } catch (err: unknown) {
    console.log('❌ Erro:', err instanceof Error ? err.message : 'Unknown error');
  }

  // 5. Tentar pages
  console.log('\n5️⃣ Testando /wp-json/wp/v2/pages');
  try {
    const pagesRes = await axios.get(`${BASE_URL}/wp-json/wp/v2/pages`, {
      params: { per_page: 5 }
    });
    console.log(`✅ Páginas encontradas: ${pagesRes.data.length}`);
    pagesRes.data.forEach((page: { id: number; title: { rendered: string } }) => {
      console.log(`   - ID ${page.id}: ${page.title.rendered}`);
    });
  } catch (err: unknown) {
    console.log('❌ Erro:', err instanceof Error ? err.message : 'Unknown error');
  }

  // 6. Verificar se há taxonomias customizadas
  console.log('\n6️⃣ Testando /wp-json/wp/v2/taxonomies');
  try {
    const taxRes = await axios.get(`${BASE_URL}/wp-json/wp/v2/taxonomies`);
    console.log('✅ Taxonomias encontradas:', Object.keys(taxRes.data));
  } catch (err: unknown) {
    console.log('❌ Erro:', err instanceof Error ? err.message : 'Unknown error');
  }

  console.log('\n✨ Descoberta completa!\n');
}

// Executar
discoverEndpoints().catch(console.error);
