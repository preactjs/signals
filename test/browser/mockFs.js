// Some babel plugins require some other babel projects that use NodeJS's `fs`
// module. So to run those plugins in the browser I'm mocking the fs module here.
console.error("fs module is not supported in browser tests.");
