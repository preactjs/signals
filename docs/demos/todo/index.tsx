import { useEffect, useState } from "preact/hooks";
import {
	createModel,
	signal,
	computed,
	effect,
	Model,
	ModelConstructor,
	ReadonlySignal,
} from "@preact/signals-core";
import { For, Show } from "@preact/signals/utils";
import "./style.css";

interface Todo {
	id: number;
	text: string;
	completed: boolean;
}

let nextId = 0;

interface TodosModel {
	todos: ReadonlySignal<Todo[]>;
	completedCount: ReadonlySignal<number>;
	activeCount: ReadonlySignal<number>;
	addTodo: (text: string) => void;
	toggleTodo: (id: number) => void;
	removeTodo: (id: number) => void;
	clearCompleted: () => void;
}

// Core business domain model - manages the todo list and operations
const TodosModel: ModelConstructor<TodosModel> = createModel(() => {
	const todos = signal<Todo[]>([], { name: "todos" });

	// Computed value: count of completed todos
	const completedCount = computed(
		() => todos.value.filter(t => t.completed).length,
		{ name: "completed-count" }
	);

	// Computed value: count of active todos
	const activeCount = computed(
		() => todos.value.filter(t => !t.completed).length,
		{ name: "active-count" }
	);

	// Action: Add a new todo
	const addTodo = (text: string) => {
		if (text.trim()) {
			todos.value = [
				...todos.value,
				{
					id: ++nextId,
					text: text.trim(),
					completed: false,
				},
			];
		}
	};

	// Action: Toggle todo completion status
	const toggleTodo = (id: number) => {
		todos.value = todos.value.map(t =>
			t.id === id ? { ...t, completed: !t.completed } : t
		);
	};

	// Action: Remove a todo
	const removeTodo = (id: number) => {
		todos.value = todos.value.filter(t => t.id !== id);
	};

	// Action: Clear all completed todos
	const clearCompleted = () => {
		todos.value = todos.value.filter(t => !t.completed);
	};

	return {
		todos,
		completedCount,
		activeCount,
		addTodo,
		toggleTodo,
		removeTodo,
		clearCompleted,
	};
});

interface TodosViewModel {
	todosModel: Model<TodosModel>;
	filter: ReadonlySignal<"all" | "active" | "completed">;
	filteredTodos: ReadonlySignal<Todo[]>;
	setFilter: (newFilter: "all" | "active" | "completed") => void;
}

// View model - manages UI state and filtering, composes the business model
const TodosViewModel: ModelConstructor<TodosViewModel> = createModel(() => {
	// Nested model: contains the core business logic
	const todosModel = new TodosModel();

	// View state: current filter
	const filter = signal<"all" | "active" | "completed">("all", {
		name: "filter",
	});

	// Computed value: filtered todos based on current filter and todos from nested model
	const filteredTodos = computed(
		() => {
			const currentFilter = filter.value;
			const allTodos = todosModel.todos.value;
			if (currentFilter === "active") return allTodos.filter(t => !t.completed);
			if (currentFilter === "completed")
				return allTodos.filter(t => t.completed);
			return allTodos;
		},
		{ name: "filtered-todos" }
	);

	// Effect: Update document title with active count (view concern)
	const originalTitle = document.title;
	effect(() => {
		const count = todosModel.activeCount.value;
		document.title =
			count === 0 ? "TodoMVC - No active todos" : `TodoMVC (${count} active)`;

		// Cleanup: restore original title when model is disposed
		return () => {
			document.title = originalTitle;
		};
	});

	// Action: Set the current filter
	const setFilter = (newFilter: "all" | "active" | "completed") => {
		filter.value = newFilter;
	};

	const debugData = computed(() => JSON.stringify({todosModel, filter, filteredTodos}));

	return {
		// Expose the nested business model
		todosModel,
		// View-specific state
		filter,
		filteredTodos,
		setFilter,
		// For debugging purposes in this demo
		debugData,
	};
});

function useModel<TModel>(constructModel: () => Model<TModel>): Model<TModel> {
	const model = useState(() => constructModel())[0];
	useEffect(() => () => model[Symbol.dispose]());
	return model;
}

function FilterButton({
	filterType,
	currentFilter,
	onClick,
}: {
	filterType: "all" | "active" | "completed";
	currentFilter: ReadonlySignal<"all" | "active" | "completed">;
	onClick: () => void;
}) {
	// Signal reads directly in JSX are reactive - this component only re-renders when currentFilter changes
	return (
		<button
			onClick={onClick}
			class={`todo-filter-btn ${currentFilter.value === filterType ? "active" : ""}`}
		>
			{filterType}
		</button>
	);
}

export default function TodoMVC() {
	// Create a single instance of the view model that persists across renders
	const viewModel = useModel(() => new TodosViewModel());

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const input = form.elements.namedItem("todo-input") as HTMLInputElement;
		viewModel.todosModel.addTodo(input.value);
		input.value = "";
	};

	return (
		<div class="todo-container">
			<h1 class="todo-header">TodoMVC Demo</h1>
			<p class="todo-description">
				Showcasing <code>createModel</code> with separated business and view
				models
			</p>

			{/* Input form */}
			<form onSubmit={handleSubmit} class="todo-form">
				<input
					type="text"
					name="todo-input"
					placeholder="What needs to be done?"
					class="todo-input"
				/>
			</form>

			{/* Todo list */}
			<div class="todo-list">
				<For each={viewModel.filteredTodos}>
					{todo => (
						<div key={todo.id} class="todo-item">
							<input
								type="checkbox"
								checked={todo.completed}
								onChange={() => viewModel.todosModel.toggleTodo(todo.id)}
								class="todo-checkbox"
							/>
							<span class={`todo-text ${todo.completed ? "completed" : ""}`}>
								{todo.text}
							</span>
							<button
								onClick={() => viewModel.todosModel.removeTodo(todo.id)}
								class="todo-delete-btn"
							>
								Delete
							</button>
						</div>
					)}
				</For>
			</div>

			{/* Footer stats and filters */}
			<div class="todo-footer">
				<div class="todo-footer-stats">
					<div class="todo-stats-text">
						<strong>{viewModel.todosModel.activeCount}</strong> active,{" "}
						<strong>{viewModel.todosModel.completedCount}</strong> completed
					</div>
					<Show when={viewModel.todosModel.completedCount}>
						<button
							onClick={() => viewModel.todosModel.clearCompleted()}
							class="todo-clear-btn"
						>
							Clear completed
						</button>
					</Show>
				</div>

				{/* Filter buttons */}
				<div class="todo-filters">
					{(["all", "active", "completed"] as const).map(filterType => (
						<FilterButton
							key={filterType}
							filterType={filterType}
							currentFilter={viewModel.filter}
							onClick={() => viewModel.setFilter(filterType)}
						/>
					))}
				</div>
			</div>

			<pre class="todo-debug">{viewModel.debugData}</pre>
		</div>
	);
}
