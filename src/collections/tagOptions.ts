import taxonomy from '../../content/tags-taxonomy.json'

// Derive Problems.tags select options from Ted's single-source taxonomy
// (content/tags-taxonomy.json). Value = stable二级 key; label = "zh / en".
// Keeping this derived avoids drift between the data model and the taxonomy.
type Subtopic = { key: string; zh: string; en: string; optional?: boolean }
type Category = { key: string; zh: string; en: string; subtopics: Subtopic[] }

export const tagOptions = (taxonomy.categories as Category[]).flatMap((cat) =>
  cat.subtopics.map((st) => ({
    label: `${cat.zh}/${st.zh} · ${st.en}`,
    value: st.key,
  })),
)

export const tagValues = tagOptions.map((o) => o.value)
