import styles from './minigame.module.css'

export default function RulesTab() {
  return (
    <div className={styles.rulesWrap}>
      <h2 className={styles.rulesTitle}>Правила игры: Track Trouble 🛤</h2>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🎯 Цель игры</h3>
        <p>Вы выбираете вагонетки, чтобы пересечь пропасть и заработать очки. Игра идёт <strong>9 раундов</strong>, в каждом раунде <strong>2 пересечения</strong>. Все игроки стартуют на южной стороне (внизу).</p>
        <p>После 9 раундов побеждает тот, у кого больше всего очков.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🗺 Структура раунда</h3>
        <p>В каждом раунде свой макет путей. Раунд состоит из двух фаз:</p>
        <ul className={styles.rulesList}>
          <li><strong>Пересечение 1:</strong> игроки на южной стороне, каждый выбирает действие.</li>
          <li><strong>Пересечение 2:</strong> игроки находятся там, куда попали после первого пересечения, и снова выбирают действие.</li>
        </ul>
        <p>Каждая фаза длится <strong>24 часа</strong>, но завершается раньше, если все подали заявки.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🚃 Что можно сделать в пересечении</h3>
        <p>Каждое пересечение вы выбираете <strong>одно</strong> действие: сесть в вагонетку или дёрнуть рычаг.</p>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>🚃 Сесть в вагонетку</div>
          <p>Вагонетки на пути сцеплены в связку. Чтобы связка тронулась, <strong>каждая вагонетка должна быть занята</strong>. Если желающих больше или меньше, чем мест, связка никуда не поедет и никто не получит очков.</p>
          <p>Если людей ровно столько, сколько нужно, связка уезжает по путям на другую сторону. Все, кто в ней сидел, получают очки того назначения, куда привели пути.</p>
        </div>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>⚡ Дёрнуть рычаг</div>
          <p>Рычаг меняет направление путей своего цвета. Пути переключаются <strong>за каждого игрока, который дёрнул рычаг</strong>: если рычаг дёрнут дважды, направление вернётся в исходное.</p>
          <p>Дёрнуть можно только тот рычаг, который стоит на <strong>вашей стороне пропасти</strong>. Некоторые рычаги вынесены на оба берега, такие доступны всем.</p>
          <p>Серые пути отключены, вагонетка по ним не поедет. Она поедет по <strong>цветному</strong> пути, подсвеченному цветом рычага.</p>
          <p>Переключения рычагов срабатывают <strong>до</strong> отправки вагонеток и <strong>сохраняются на второе пересечение</strong>.</p>
        </div>

        <div className={styles.rulesCard}>
          <div className={styles.rulesCardTitle}>⏸ Остаться</div>
          <p>Если вы не подали заявку или выбрали «остаться», вы никуда не едете. За это пересечение будет <strong>0 очков</strong>.</p>
        </div>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>💯 Сколько очков вы получите</h3>
        <p>Очки берутся с <strong>того бокса, куда фактически приедет вагонетка</strong>, а не с пути, на котором вы сели. Если ваш путь сходится с другими в развилке, цена поездки зависит от того, как стоят рычаги в момент отправления.</p>
        <p className={styles.rulesExample}>
          Пример: пути A, B и C сходятся в одном узле. Пока подсвечена левая ветка, все трое едут в бокс «2». Кто-то дёрнул рычаг, подсветилась правая ветка, и та же посадка стоит уже «4».
        </p>
        <p>Поэтому перед посадкой смотрите не только на число сверху своего пути, но и на то, куда ведёт подсвеченная ветка.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>📐 Порядок разрешения</h3>
        <ol className={styles.rulesList}>
          <li>Сначала срабатывают все рычаги, разом по всем заявкам.</li>
          <li>Затем едут вагонетки: заявки группируются по связкам и проверяется точность заполнения.</li>
          <li>Уехавшая связка не возвращается, во втором пересечении её уже нет.</li>
          <li>Кто не пересёк пропасть, остаётся на своей стороне.</li>
        </ol>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>Ψ Псигемы</h3>
        <p>Каждый раз, когда ваш счёт достигает <strong>числа, кратного 10</strong>, вы получаете <strong>1 псигем</strong>. Начисление считается после каждого пересечения.</p>
        <p className={styles.rulesExample}>
          Пример: у вас 8 очков. В первом пересечении заработали 2, стало 10, получили псигем. Во втором заработали ещё 3, стало 13. Следующий псигем будет на 20 очках.
        </p>
        <p>Игроки с одним из трёх наибольших результатов получают <strong>ещё по 1 псигему</strong> в конце игры.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>👁 Посмотреть будущий раунд</h3>
        <p>За <strong>2 псигема</strong> можно заранее увидеть макет ещё не начавшегося раунда. Ведущий может быть офлайн, но макет будет выложен в течение 12 часов.</p>
      </section>

      <section className={styles.rulesSection}>
        <h3 className={styles.rulesSectionTitle}>🏆 Итоговые награды</h3>
        <table className={styles.rulesTable}>
          <tbody>
            <tr><td>Единственный победитель</td><td>2 жетона неуязвимости и опал</td></tr>
            <tr><td>Один из трёх наибольших результатов</td><td>+1 псигем</td></tr>
            <tr><td>Ближе всех к среднему числу очков</td><td>Опал (Opal Challenge)</td></tr>
            <tr><td>Наименьшее количество очков</td><td>Кандидат на выбывание</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
