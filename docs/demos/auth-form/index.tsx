import { useSignal } from "@preact/signals";
import "./style.css";

function AuthForm() {
	const username = useSignal("");
	const password = useSignal("");
	const status = useSignal<"idle" | "submitting" | "success">("idle");
	const error = useSignal("");

	const handleSubmit = (e: Event) => {
		e.preventDefault();
		status.value = "submitting";
		error.value = "";
		if (password.value.length < 8) {
			error.value = "Password must be at least 8 characters long.";
			status.value = "idle";
			return;
		}

		setTimeout(() => {
			status.value = "success";
		}, 500);
	};

	return (
		<form class="auth-form" onSubmit={handleSubmit}>
			{error.value && <div class="error">{error.value}</div>}
			<label class="auth-field">
				<span>Username</span>
				<input
					type="text"
					name="username"
					value={username.value}
					onInput={e =>
						(username.value = (e.currentTarget as HTMLInputElement).value)
					}
				/>
			</label>

			<label class="auth-field">
				<span>Password</span>
				<input
					type="password"
					name="password"
					value={password.value}
					minLength={8}
					onInput={e =>
						(username.value = (e.currentTarget as HTMLInputElement).value)
					}
				/>
			</label>

			<button type="submit" disabled={status.value === "submitting"}>
				{status.value === "submitting" ? "Signing in..." : "Sign in"}
			</button>
		</form>
	);
}

export default function AuthFormDemo() {
	return (
		<div class="auth-demo">
			<div class="card">
				<AuthForm />
			</div>
		</div>
	);
}
