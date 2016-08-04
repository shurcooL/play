// Learn about OAuth.
package main

import (
	"crypto/rand"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/google/go-github/github"
	"github.com/shurcooL/go-goon"
	"golang.org/x/oauth2"
	githuboauth2 "golang.org/x/oauth2/github"
)

var githubConfig = oauth2.Config{
	ClientID:     os.Getenv("GH_BASIC_CLIENT_ID"),
	ClientSecret: os.Getenv("GH_BASIC_SECRET_ID"),
	Scopes:       nil,
	Endpoint:     githuboauth2.Endpoint,
}

func main() {
	http.HandleFunc("/", handleMain)
	http.HandleFunc("/login/github", handleLogin)
	http.HandleFunc("/callback/github", handleCallback)

	fmt.Println("Starting.")
	err := http.ListenAndServe(":8090", nil)
	if err != nil {
		log.Fatalln(err)
	}
}

func handleMain(w http.ResponseWriter, req *http.Request) {
	io.WriteString(w, `<html>
	<head>
	</head>
	<body>
		<p>
			Well, hello there!
		</p>
		<p>
			We're going to now talk to the GitHub API. Ready?
			<a href="/login/github">Sign in with GitHub</a>
		</p>
		<p>
			If that link doesn't work, remember to provide your own <a href="https://developer.github.com/v3/oauth/#web-application-flow">Client ID</a>!
		</p>
	</body>
</html>`)
}

func handleLogin(w http.ResponseWriter, req *http.Request) {
	state := cryptoRandString()
	goon.DumpExpr(state)

	url := githubConfig.AuthCodeURL(state)
	http.Redirect(w, req, url, http.StatusFound)
}

func handleCallback(w http.ResponseWriter, req *http.Request) {
	// TODO: Validate state.
	state := req.FormValue("state")
	goon.DumpExpr(state)

	token, err := githubConfig.Exchange(oauth2.NoContext, req.FormValue("code"))
	if err != nil {
		panic(err)
	}
	tc := githubConfig.Client(oauth2.NoContext, token)
	gh := github.NewClient(tc)

	user, _, err := gh.Users.Get("")
	if err != nil {
		panic(err)
	}
	goon.FdumpExpr(w, user)
}

func cryptoRandString() string {
	b := make([]byte, 256)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	return string(b)
}
