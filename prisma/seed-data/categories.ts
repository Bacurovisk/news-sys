export type CategorySeed = { slug: string; name: string; sortOrder: number };

export const categories: CategorySeed[] = [
  { slug: "brasil", name: "Brasil", sortOrder: 10 },
  { slug: "politica", name: "Política", sortOrder: 20 },
  { slug: "economia", name: "Economia", sortOrder: 30 },
  { slug: "mundo", name: "Mundo", sortOrder: 40 },
  { slug: "tecnologia", name: "Tecnologia", sortOrder: 50 },
  { slug: "ciencia", name: "Ciência", sortOrder: 60 },
  { slug: "saude", name: "Saúde", sortOrder: 70 },
  { slug: "educacao", name: "Educação", sortOrder: 80 },
  { slug: "esportes", name: "Esportes", sortOrder: 90 },
  { slug: "cultura", name: "Cultura", sortOrder: 100 },
  { slug: "entretenimento", name: "Entretenimento", sortOrder: 110 },
  { slug: "regional", name: "Regional", sortOrder: 120 },
];

// Categoria usada quando nenhuma regra se aplica.
export const FALLBACK_CATEGORY_SLUG = "brasil";
