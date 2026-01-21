import type { ComponentChildren } from "preact";

interface ButtonProps {
	onClick?: () => void;
	className?: string;
	disabled?: boolean;
	children: ComponentChildren;
	variant?: "primary" | "secondary";
	popovertarget?: string;
	active?: boolean;
}

export function Button({
	onClick,
	className = "",
	disabled = false,
	children,
	variant = "secondary",
	popovertarget,
	active = false,
}: ButtonProps) {
	const baseClass = "btn";
	const variantClass = variant === "primary" ? "btn-primary" : "btn-secondary";
	const activeClass = active ? "active" : "";
	const combinedClassName =
		`${baseClass} ${variantClass} ${activeClass} ${className}`.trim();

	return (
		<button
			popovertarget={popovertarget}
			onClick={onClick}
			className={combinedClassName}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
