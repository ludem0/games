import styles from './RulesCard.module.css'

export interface RulesSection {
  title: string
  points: string[]
}

/**
 * The rules of a game, folded away until someone asks for them. Every game page
 * carries one so a player never has to go looking for the original post.
 */
export default function RulesCard({ sections, open = false }: { sections: RulesSection[]; open?: boolean }) {
  return (
    <details className={styles.card} open={open}>
      <summary className={styles.summary}>Правила</summary>
      <div className={styles.body}>
        {sections.map(section => (
          <div key={section.title} className={styles.section}>
            <div className={styles.sectionTitle}>{section.title}</div>
            <ul className={styles.list}>
              {section.points.map((point, i) => <li key={i}>{point}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
