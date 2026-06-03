import styles from './minigame.module.css'

export default function RulesTab() {
  return (
    <div className={styles.rulesWrap}>
      <h2 className={styles.rulesTitle}>Правила игры: Переправа на Вагонетках</h2>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🎯 Цель игры</h3>
        <p>Набрать как можно больше очков за 9 раундов. Каждый раунд состоит из двух пересечений пропасти. Игроки начинают на южной стороне.</p>
        <p>По итогам игры:</p>
        <ul className={styles.rulesList}>
          <li>Единственный победитель получает <strong>2 жетона неуязвимости</strong> и <strong>опал</strong>.</li>
          <li>Игрок с наименьшим количеством очков становится <strong>кандидатом на выбывание</strong>.</li>
          <li>Игроки с одним из трёх наибольших результатов получают по <strong>1 псигему</strong>.</li>
          <li><strong>Опал-челлендж:</strong> игрок, набравший количество очков, ближайшее к среднему, получает опал.</li>
        </ul>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🗺 Структура раунда</h3>
        <p>Каждый раунд состоит из <strong>двух пересечений</strong>:</p>
        <ul className={styles.rulesList}>
          <li><strong>Пересечение 1:</strong> Игроки стартуют с юга. Нужно выбрать действие и пересечь пропасть.</li>
          <li><strong>Пересечение 2:</strong> Игроки находятся на той стороне, куда попали после пересечения 1. Снова выбирают действие.</li>
        </ul>
        <p>Каждая фаза длится <strong>24 часа</strong>, но может завершиться раньше, если все игроки подали заявки.</p>
        <p>В начале каждого нового раунда все игроки возвращаются на <strong>южную сторону</strong>.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🚃 Действия в каждом пересечении</h3>
        <p>На каждом пересечении нужно выбрать <strong>одно</strong> из следующих действий:</p>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>🚃 Сесть в вагонетку</div>
          <p>Выберите цепь вагонеток на одном из путей. Вагонетки отправятся <strong>только при точном заполнении</strong> — если в цепь сядет ровно столько игроков, сколько вмещает вагонетка. Слишком мало или слишком много — никто не поедет. Все, кто попал в отправившуюся цепь, получают очки, указанные для пункта назначения, и оказываются на другой стороне.</p>
        </div>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>⚡ Активировать переключатель</div>
          <p>Переключатель меняет состояние путей указанного цвета. Активировать можно только тот переключатель, который находится на <strong>вашей стороне пропасти</strong>. Переключатели обрабатываются до отправки вагонеток. <strong>Изменения путей сохраняются на 2-е пересечение.</strong></p>
          <p>Серые пути — <strong>отключены</strong>: вагонетки по ним не едут. Переключатель меняет серый путь на альтернативный (цветной) и наоборот.</p>
        </div>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>⏸ Остаться</div>
          <p>Если вы ничего не выберете или явно откажетесь — вы остаётесь на месте и получаете <strong>0 очков</strong> за это пересечение.</p>
        </div>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>📐 Порядок разрешения</h3>
        <ol className={styles.rulesList}>
          <li>Переключатели срабатывают первыми (по всем игрокам одновременно).</li>
          <li>Затем вагонетки: группируются по цепям, проверяется точность заполнения.</li>
          <li>Отправившиеся цепи не возвращаются — они недоступны в пересечении 2.</li>
          <li>Игроки, не пересёкшие пропасть, остаются на своей стороне.</li>
        </ol>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>Ψ Псигемы за очки</h3>
        <p>Каждый раз, когда ваш суммарный счёт пересекает <strong>кратное 10</strong>, вы получаете <strong>1 псигем</strong>. Начисление происходит последовательно — после каждого отдельного пересечения.</p>
        <p className={styles.rulesExample}>
          Пример: у вас 8 очков. В пересечении 1 вы зарабатываете 2 очка (итого 10) → получаете псигем. В пересечении 2 зарабатываете ещё 3 (итого 13). Следующий псигем — при 20 очках.
        </p>
        <p>Игроки с 1–3 наибольшими результатами дополнительно получают по <strong>1 псигему</strong> после окончания игры.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>👁 Просмотр будущего раунда</h3>
        <p>Вы можете заплатить <strong>2 псигема</strong>, чтобы увидеть макет (пути и переключатели) <strong>ещё не начавшегося</strong> раунда. Просмотр действителен для каждого раунда не более одного раза. Администратор публикует макеты в течение 12 часов.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🏆 Итоговые награды</h3>
        <table className={styles.rulesTable}>
          <tbody>
            <tr><td>Единственный победитель</td><td>2 жетона неуязвимости + опал</td></tr>
            <tr><td>Наименьшее количество очков</td><td>Кандидат на выбывание</td></tr>
            <tr><td>Топ-3 по очкам</td><td>+1 псигем каждому</td></tr>
            <tr><td>Опал-челлендж (ближе всего к среднему)</td><td>Опал</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
