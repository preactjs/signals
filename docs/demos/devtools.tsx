import { useSignal } from "@preact/signals";
import { Show, For } from "@preact/signals/utils";
import { computed, signal } from "@preact/signals-core";
import "./devtools.css";

type TodoModel = {
	id: number;
	get text(): string;
	get done(): boolean;
	toggle(): void;
	updateText(newText: string): void;
};

const createTodoModel = (id: number, input: string): TodoModel => {
	const text = signal(input, { name: `todo-${id}-text` });
	const done = signal(false, { name: `todo-${id}-done` });

	return {
		id,
		get text() {
			return text.value;
		},
		get done() {
			return done.value;
		},
		toggle() {
			done.value = !done.value;
		},
		updateText(newText: string) {
			text.value = newText;
		},
	};
};

const todosModel = (() => {
	const todos = signal<TodoModel[]>(
		[
			createTodoModel(1, "Learn Preact Signals"),
			createTodoModel(2, "Build something fun"),
		],
		{ name: "todos-list" }
	);

	const allDone = computed(
		() => todos.value.length > 0 && todos.value.every(t => t.done),
		{ name: "all-done" }
	);

	return {
		todos,
		allDone,
		add(text: string) {
			todos.value = [...todos.value, createTodoModel(Date.now(), text)];
		},
	};
})();

export default function DevToolsDemo() {
	return (
		<div>
			<h1>DevTools Demo</h1>
			<main>
				<TodosList />
			</main>
		</div>
	);
}

function TodosList() {
	const newTodoText = useSignal("", { name: "new-todo-text" });

	return (
		<div>
			<h2>Todos</h2>
			<div class="new-todo">
				<label>
					New Todo:{" "}
					<input
						type="text"
						value={newTodoText.value}
						onInput={e => (newTodoText.value = e.currentTarget.value)}
					/>
				</label>
				<button
					onClick={() => {
						if (newTodoText.value.trim() !== "") {
							todosModel.add(newTodoText.value.trim());
							newTodoText.value = "";
						}
					}}
				>
					Add
				</button>
			</div>
			<Show when={todosModel.allDone}>
				<p>All todos are done! 🎉</p>
			</Show>
			<ul>
				<For each={todosModel.todos}>
					{todo => <TodoItem key={todo.id} todo={todo} />}
				</For>
			</ul>
		</div>
	);
}

function TodoItem({ todo }: { todo: TodoModel }) {
	const isEditing = useSignal(false, { name: `todo-${todo.id}-isEditing` });
	return (
		<li class="todo-item">
			<input
				type="checkbox"
				checked={todo.done}
				onChange={() => todo.toggle()}
			/>
			<Show when={isEditing} fallback={<p>{todo.text}</p>}>
				<input
					type="text"
					value={todo.text}
					onInput={e => todo.updateText(e.currentTarget.value)}
				/>
			</Show>
			<button onClick={() => (isEditing.value = !isEditing.value)}>
				Toggle Edit
			</button>
		</li>
	);
}
