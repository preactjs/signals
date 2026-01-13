import { signal, computed, effect, createModel } from "@preact/signals-core";
import { useSignal } from "@preact/signals";

// TODO:
// - Fix gameLog cycle when leveling up
// - Invesgitate callstack explosion in debug tools

// ============================================================================
// 🗡️ Dungeon Adventure - A createModel Demo
// ============================================================================
// This demo showcases the createModel API through a mini text-based RPG:
// - Computed properties for derived stats
// - Effects for game events and logging
// - Model composition (Player contains Inventory, Game contains Player & Monster)
// - Actions with automatic batching
// - Factory arguments for configuration
// - Symbol.dispose for cleanup

// ============================================================================
// Inventory Model - Demonstrates nested model with its own effects
// ============================================================================
const InventoryModel = createModel((capacity: number) => {
	const items = signal<string[]>([]);
	const gold = signal(0);

	const isFull = computed(() => items.value.length >= capacity);
	const itemCount = computed(() => items.value.length);
	const maxCapacity = computed(() => capacity);

	return {
		items,
		gold,
		maxCapacity,
		isFull,
		itemCount,

		addItem(item: string) {
			if (!isFull.value) {
				items.value = [...items.value, item];
				return true;
			}
			return false;
		},

		removeItem(item: string) {
			const idx = items.value.indexOf(item);
			if (idx !== -1) {
				items.value = items.value.filter((_, i) => i !== idx);
				return true;
			}
			return false;
		},

		addGold(amount: number) {
			gold.value += amount;
		},
	};
});

// ============================================================================
// Monster Model - Simple enemy with computed threat level
// ============================================================================
const MonsterModel = createModel(
	(monsterName: string, baseHp: number, baseDamage: number) => {
		const hp = signal(baseHp);
		const maxHp = computed(() => baseHp);
		const damage = computed(() => baseDamage);
		const name = computed(() => monsterName);

		const isAlive = computed(() => hp.value > 0);
		const threatLevel = computed(() => {
			const hpRatio = hp.value / baseHp;
			if (hpRatio > 0.7) return "🔴 Dangerous";
			if (hpRatio > 0.3) return "🟡 Wounded";
			return "🟢 Near Death";
		});

		return {
			name,
			hp,
			maxHp,
			damage,
			isAlive,
			threatLevel,

			takeDamage(amount: number) {
				hp.value = Math.max(0, hp.value - amount);
			},
		};
	}
);

// ============================================================================
// Player Model - Demonstrates computed stats and model composition
// ============================================================================
const PlayerModel = createModel(
	(playerName: string, charClass: "warrior" | "mage" | "rogue") => {
		const level = signal(1);
		const xp = signal(0);
		const hp = signal(100);
		const maxHp = signal(100);

		// Wrap primitives in computed for type safety
		const name = computed(() => playerName);
		const characterClass = computed(() => charClass);

		// Base stats vary by class
		const baseStats = {
			warrior: { str: 10, int: 3, agi: 5 },
			mage: { str: 3, int: 10, agi: 5 },
			rogue: { str: 5, int: 5, agi: 10 },
		}[charClass];

		const strength = signal(baseStats.str);
		const intelligence = signal(baseStats.int);
		const agility = signal(baseStats.agi);

		// Computed derived stats - demonstrates reactive computations
		const attackPower = computed(() => {
			const base = charClass === "mage" ? intelligence.value : strength.value;
			return Math.floor(base * (1 + level.value * 0.1));
		});

		const critChance = computed(() => Math.min(50, agility.value * 2));

		const xpToNextLevel = computed(() => level.value * 100);
		const isAlive = computed(() => hp.value > 0);

		// Nested model - Inventory
		const inventory = new InventoryModel(5);

		return {
			name,
			characterClass,
			level,
			xp,
			hp,
			maxHp,
			strength,
			intelligence,
			agility,
			attackPower,
			critChance,
			xpToNextLevel,
			isAlive,
			inventory,

			heal(amount: number) {
				hp.value = Math.min(maxHp.value, hp.value + amount);
			},

			takeDamage(amount: number) {
				hp.value = Math.max(0, hp.value - amount);
			},

			gainXp(amount: number) {
				xp.value += amount;
				// Check for level up
				while (xp.value >= xpToNextLevel.value) {
					xp.value -= xpToNextLevel.value;
					this.levelUp();
				}
			},

			levelUp() {
				level.value++;
				// Stat increases based on class
				if (charClass === "warrior") strength.value += 3;
				else if (charClass === "mage") intelligence.value += 3;
				else agility.value += 3;
				// Increase max HP and heal
				maxHp.value += 20;
				hp.value = maxHp.value;
			},
		};
	}
);

// ============================================================================
// Game Model - Main game state with effects for logging and game events
// ============================================================================
const GameModel = createModel(
	(playerName: string, playerClass: "warrior" | "mage" | "rogue") => {
		const player = new PlayerModel(playerName, playerClass);

		const gameLog = signal<string[]>([]);
		const currentMonster = signal<InstanceType<typeof MonsterModel> | null>(
			null
		);
		const monstersDefeated = signal(0);
		const gameOver = signal(false);
		const victory = signal(false);

		// Available loot pool
		const lootTable = [
			"🗡️ Sword",
			"🛡️ Shield",
			"🧪 Potion",
			"📜 Scroll",
			"💎 Gem",
			"🔮 Orb",
		];

		const addLog = (message: string) => {
			gameLog.value = [...gameLog.value.slice(-9), message];
		};

		// Effect: Monitor player death - demonstrates effect cleanup
		effect(() => {
			if (!player.isAlive.value && !gameOver.value) {
				gameOver.value = true;
				addLog("💀 Game Over! You have been defeated.");
			}
		});

		// Effect: Victory condition
		effect(() => {
			if (monstersDefeated.value >= 5 && !victory.value) {
				victory.value = true;
				gameOver.value = true;
				addLog("🏆 Victory! You've conquered the dungeon!");
			}
		});

		// Effect: Log level ups
		effect(() => {
			const lvl = player.level.value;
			if (lvl > 1) {
				addLog(`⬆️ Level Up! You are now level ${lvl}!`);
			}
		});

		return {
			player,
			gameLog,
			currentMonster,
			monstersDefeated,
			gameOver,
			victory,

			startAdventure() {
				addLog(
					`⚔️ ${player.name.value} the ${player.characterClass.value} enters the dungeon!`
				);
				this.spawnMonster();
			},

			spawnMonster() {
				const monsters = [
					{ name: "🐀 Giant Rat", hp: 20, dmg: 5 },
					{ name: "🦇 Cave Bat", hp: 15, dmg: 8 },
					{ name: "🧟 Zombie", hp: 40, dmg: 10 },
					{ name: "🐺 Dire Wolf", hp: 35, dmg: 12 },
					{ name: "🐉 Baby Dragon", hp: 60, dmg: 15 },
				];
				const choice = monsters[Math.floor(Math.random() * monsters.length)];
				const monster = new MonsterModel(choice.name, choice.hp, choice.dmg);
				currentMonster.value = monster;
				addLog(`${choice.name} appears! (HP: ${choice.hp})`);
			},

			// Attack action - demonstrates batched updates
			attack() {
				const monster = currentMonster.value;
				if (!monster || !monster.isAlive.value || gameOver.value) return;

				// Calculate damage with crit chance
				const isCrit = Math.random() * 100 < player.critChance.value;
				const damage = isCrit
					? player.attackPower.value * 2
					: player.attackPower.value;

				// Player attacks - multiple signal updates batched automatically
				monster.takeDamage(damage);
				addLog(
					isCrit
						? `💥 Critical hit! You deal ${damage} damage!`
						: `⚔️ You attack for ${damage} damage.`
				);

				// Check if monster died
				if (!monster.isAlive.value) {
					const xpGain = 25 + monstersDefeated.value * 10;
					const goldGain = 10 + Math.floor(Math.random() * 20);

					// Batched updates
					player.gainXp(xpGain);
					player.inventory.addGold(goldGain);
					monstersDefeated.value++;

					addLog(
						`✨ ${monster.name.value} defeated! +${xpGain} XP, +${goldGain} gold`
					);

					// Chance for loot
					if (Math.random() < 0.4) {
						const loot =
							lootTable[Math.floor(Math.random() * lootTable.length)];
						if (player.inventory.addItem(loot)) {
							addLog(`🎁 Found ${loot}!`);
						} else {
							addLog(`🎒 Inventory full! ${loot} left behind.`);
						}
					}

					// Spawn next monster if not victory
					if (monstersDefeated.value < 5) {
						this.spawnMonster();
					}
				} else {
					// Monster counterattack
					player.takeDamage(monster.damage.value);
					addLog(
						`🩸 ${monster.name.value} strikes back for ${monster.damage.value} damage!`
					);
				}
			},

			usePotion() {
				if (player.inventory.removeItem("🧪 Potion")) {
					player.heal(30);
					addLog("💚 Used potion! Healed 30 HP.");
				} else {
					addLog("❌ No potions in inventory!");
				}
			},

			flee() {
				if (Math.random() < 0.5) {
					addLog("🏃 You fled successfully!");
					this.spawnMonster();
				} else {
					const monster = currentMonster.value;
					if (monster?.isAlive.value) {
						player.takeDamage(monster.damage.value);
						addLog(`🏃 Failed to flee! Took ${monster.damage.value} damage!`);
					}
				}
			},
		};
	}
);

// ============================================================================
// UI Components
// ============================================================================

function HealthBar({
	current,
	max,
	label,
}: {
	current: number;
	max: number;
	label: string;
}) {
	const percentage = Math.max(0, (current / max) * 100);
	const color =
		percentage > 50 ? "#4ade80" : percentage > 25 ? "#fbbf24" : "#ef4444";

	return (
		<div style={{ marginBottom: "8px" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					fontSize: "12px",
				}}
			>
				<span>{label}</span>
				<span>
					{current}/{max}
				</span>
			</div>
			<div
				style={{
					background: "#333",
					borderRadius: "4px",
					height: "12px",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						background: color,
						height: "100%",
						width: `${percentage}%`,
						transition: "width 0.3s, background 0.3s",
					}}
				/>
			</div>
		</div>
	);
}

function GameUI({ game }: { game: InstanceType<typeof GameModel> }) {
	const {
		player,
		currentMonster,
		gameLog,
		monstersDefeated,
		gameOver,
		victory,
	} = game;

	return (
		<div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
			{/* Player Panel */}
			<div
				style={{
					background: "#1a1a2e",
					padding: "16px",
					borderRadius: "8px",
					minWidth: "250px",
					color: "#fff",
				}}
			>
				<h4 style={{ margin: "0 0 12px 0", color: "#60a5fa" }}>
					{player.name.value} the{" "}
					{player.characterClass.value.charAt(0).toUpperCase() +
						player.characterClass.value.slice(1)}
				</h4>
				<div style={{ fontSize: "14px", marginBottom: "8px" }}>
					Level {player.level}
				</div>
				<HealthBar
					current={player.hp.value}
					max={player.maxHp.value}
					label="HP"
				/>
				<div
					style={{
						background: "#0f0f1a",
						height: "8px",
						borderRadius: "4px",
						marginBottom: "12px",
					}}
				>
					<div
						style={{
							background: "#8b5cf6",
							height: "100%",
							borderRadius: "4px",
							width: `${(player.xp.value / player.xpToNextLevel.value) * 100}%`,
						}}
					/>
				</div>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: "4px",
						fontSize: "12px",
					}}
				>
					<span>⚔️ ATK: {player.attackPower}</span>
					<span>🎯 Crit: {player.critChance}%</span>
					<span>💪 STR: {player.strength}</span>
					<span>🧠 INT: {player.intelligence}</span>
					<span>🏃 AGI: {player.agility}</span>
					<span>💰 Gold: {player.inventory.gold}</span>
				</div>
				<div style={{ marginTop: "12px", fontSize: "12px" }}>
					<div style={{ color: "#888" }}>
						🎒 Inventory ({player.inventory.itemCount}/
						{player.inventory.maxCapacity}):
					</div>
					<div style={{ color: "#fbbf24" }}>
						{player.inventory.items.value.length > 0
							? player.inventory.items.value.join(" ")
							: "(empty)"}
					</div>
				</div>
			</div>

			{/* Battle Panel */}
			<div
				style={{
					background: "#1a1a2e",
					padding: "16px",
					borderRadius: "8px",
					minWidth: "280px",
					color: "#fff",
				}}
			>
				<h4 style={{ margin: "0 0 12px 0", color: "#f87171" }}>
					⚔️ Battle ({monstersDefeated}/5 defeated)
				</h4>

				{currentMonster.value && currentMonster.value.isAlive.value ? (
					<div style={{ marginBottom: "16px" }}>
						<div style={{ fontSize: "18px", marginBottom: "4px" }}>
							{currentMonster.value.name.value}
						</div>
						<div style={{ fontSize: "12px", marginBottom: "8px" }}>
							{currentMonster.value.threatLevel}
						</div>
						<HealthBar
							current={currentMonster.value.hp.value}
							max={currentMonster.value.maxHp.value}
							label="Monster HP"
						/>
					</div>
				) : (
					<div style={{ color: "#888", marginBottom: "16px" }}>
						No monster present
					</div>
				)}

				<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
					<button
						onClick={() => game.attack()}
						disabled={gameOver.value}
						style={{
							padding: "8px 16px",
							background: gameOver.value ? "#333" : "#dc2626",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
							cursor: gameOver.value ? "not-allowed" : "pointer",
						}}
					>
						⚔️ Attack
					</button>
					<button
						onClick={() => game.usePotion()}
						disabled={gameOver.value}
						style={{
							padding: "8px 16px",
							background: gameOver.value ? "#333" : "#16a34a",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
							cursor: gameOver.value ? "not-allowed" : "pointer",
						}}
					>
						🧪 Potion
					</button>
					<button
						onClick={() => game.flee()}
						disabled={gameOver.value}
						style={{
							padding: "8px 16px",
							background: gameOver.value ? "#333" : "#ca8a04",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
							cursor: gameOver.value ? "not-allowed" : "pointer",
						}}
					>
						🏃 Flee
					</button>
				</div>

				{gameOver.value && (
					<div
						style={{
							marginTop: "16px",
							padding: "12px",
							background: victory.value ? "#166534" : "#7f1d1d",
							borderRadius: "4px",
							textAlign: "center",
							fontSize: "18px",
						}}
					>
						{victory.value ? "🏆 Victory!" : "💀 Game Over"}
					</div>
				)}
			</div>

			{/* Log Panel */}
			<div
				style={{
					background: "#0f0f1a",
					padding: "16px",
					borderRadius: "8px",
					minWidth: "280px",
					maxWidth: "300px",
					color: "#fff",
				}}
			>
				<h4 style={{ margin: "0 0 12px 0", color: "#a3a3a3" }}>
					📜 Adventure Log
				</h4>
				<div style={{ fontSize: "12px", lineHeight: "1.6" }}>
					{gameLog.value.map((log, i) => (
						<div key={i} style={{ opacity: 0.7 + i * 0.03 }}>
							{log}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// Main Demo Component
// ============================================================================
export default function ModelsDemo() {
	const game = useSignal<InstanceType<typeof GameModel> | null>(null);
	const playerName = useSignal("Hero");
	const playerClass = useSignal<"warrior" | "mage" | "rogue">("warrior");

	const startGame = () => {
		// Dispose previous game if exists
		if (game.value) {
			game.value[Symbol.dispose]();
		}
		const newGame = new GameModel(playerName.value, playerClass.value);
		newGame.startAdventure();
		game.value = newGame;
	};

	return (
		<div>
			<p class="info">
				This demo showcases <code>createModel</code> - a way to encapsulate
				reactive state, computed values, and effects into reusable, composable
				models. The game features nested models (Player → Inventory), computed
				stats, effects for game events, and automatic effect cleanup via{" "}
				<code>Symbol.dispose</code>.
			</p>

			{!game.value ? (
				<div
					style={{
						background: "#1a1a2e",
						padding: "24px",
						borderRadius: "8px",
						maxWidth: "400px",
						color: "#fff",
					}}
				>
					<h3 style={{ margin: "0 0 16px 0" }}>🗡️ Dungeon Adventure</h3>
					<div style={{ marginBottom: "16px" }}>
						<label style={{ display: "block", marginBottom: "8px" }}>
							Hero Name:
							<input
								type="text"
								value={playerName}
								onInput={e => (playerName.value = e.currentTarget.value)}
								style={{
									display: "block",
									width: "100%",
									padding: "8px",
									marginTop: "4px",
									borderRadius: "4px",
									border: "1px solid #333",
									background: "#0f0f1a",
									color: "#fff",
								}}
							/>
						</label>
					</div>
					<div style={{ marginBottom: "16px" }}>
						<label style={{ display: "block", marginBottom: "8px" }}>
							Class:
							<select
								value={playerClass}
								onChange={e =>
									(playerClass.value = e.currentTarget
										.value as typeof playerClass.value)
								}
								style={{
									display: "block",
									width: "100%",
									padding: "8px",
									marginTop: "4px",
									borderRadius: "4px",
									border: "1px solid #333",
									background: "#0f0f1a",
									color: "#fff",
								}}
							>
								<option value="warrior">⚔️ Warrior (High STR)</option>
								<option value="mage">🔮 Mage (High INT)</option>
								<option value="rogue">🗡️ Rogue (High AGI)</option>
							</select>
						</label>
					</div>
					<button
						onClick={startGame}
						style={{
							width: "100%",
							padding: "12px",
							background: "#7c3aed",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "16px",
						}}
					>
						⚔️ Enter the Dungeon
					</button>
				</div>
			) : (
				<>
					<GameUI game={game.value} />
					<button
						onClick={startGame}
						style={{
							marginTop: "16px",
							padding: "8px 16px",
							background: "#374151",
							color: "#fff",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
						}}
					>
						🔄 New Game
					</button>
				</>
			)}
		</div>
	);
}
