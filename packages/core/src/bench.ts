import * as core from "./index";

{
  const count = core.signal(0);
  const double = core.computed(() => count.value * 2);

  core.effect(() => double.value + count.value);
  core.effect(() => double.value + count.value);
  core.effect(() => double.value + count.value);

  console.time("core");

  for (let i = 0; i < 20000000; i++) {
    count.value++;
    double.value;
  }

  console.timeEnd("core");
}
