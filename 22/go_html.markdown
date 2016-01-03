```HTML
<html>
	<head>
		<title>Go Package Store</title>
		<link href="assets/style.css" rel="stylesheet" type="text/css" />
		<script src="assets/script.js" type="text/javascript"></script>
	</head>
	<body>
		<div id="checking_updates">
			<h2 style="text-align: center;">Checking for updates...</h2>
		</div>
		<div>
			<h2 style="text-align: center;">No Updates Available</h2>
			<a>Plain Anchor</a>
			<a href="/home.html">Home Link</a>
		</div>
		<script>document.getElementById("checking_updates").style.display = "none";</script>
	</body>
</html>
```

```Go
Html(
	Head(
		Title("Go Package Store"),
		Link{Href: "assets/style.css", Rel: "stylesheet", Type: "text/css"},
		Script{Src: "assets/script.js", Type: "text/javascript"},
	),
	Body(
		Div{Id: "checking_updates"}(
			H2{Style: "text-align: center;"}("Checking for updates..."),
		),
		Div(
			A("Plain Anchor"),
			A{Href: "/home"}("Home Link"},
		),
	),
	Script(func() { document.getElementById("checking_updates").style.display = "none" }),
)
```

---

```HTML
<html>
	<body>
		<h1>Page</h1>
		<h2>Links Are Here</h2>
		<div>
			<span><b>bold:</b> not bold</span>
			<a>Plain Anchor</a>
			<a href="/home.html">Home Link</a>
			<ul>
				<li>Plain Item</li>
			</ul>
		</div>
	</body>
</html>
```

```Go
Html{
	Body{
		H1{"GophURLs"},
		H2{"Links Are Here"},
		Div{
			Span{B{"bold:"}, " not bold"},
			A_options{Href: "http://www.google.com/"}("google.com"),

			A{Href: "/home", "Home Link"},
			A(A_options{Href: "/home"}, "Home Link"),

			A{"Plain Anchor"},
			A{Href: "/home"}{"Home Link"},

			Ul{
				Li{"Plain Item"},
				Li{B{"bold:"}, " not bold, again"},
			},
		},
	},
}
```
