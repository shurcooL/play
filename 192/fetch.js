fetch("https://localhost:4430/clockstream").then((resp) => {
	let r = resp.body.getReader();

	let f = () => {
		return r.read().then((result) => {
			console.log(new TextDecoder("utf-8").decode(result.value));

			if (result.done) {
				return;
			};

			return f();
		});
	};

	f();
});
