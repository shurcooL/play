// Learn about OAuth.
package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/google/go-github/github"
	"github.com/shurcooL/go-goon"
	"golang.org/x/oauth2"
)

var (
	clientID = os.Getenv("GH_BASIC_CLIENT_ID")
	secretID = os.Getenv("GH_BASIC_SECRET_ID")
)

func main() {
	http.HandleFunc("/", handleMain)
	http.HandleFunc("/github-login", handleLogin)
	http.HandleFunc("/github-callback", handleCallback)

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
			<a href="/github-login">Sign in with GitHub</a>
		</p>
		<p>
			If that link doesn't work, remember to provide your own <a href="https://developer.github.com/v3/oauth/#web-application-flow">Client ID</a>!
		</p>
	</body>
</html>`)
}

func handleLogin(w http.ResponseWriter, req *http.Request) {
	state := cryptoRandBase64String()
	goon.DumpExpr(state)

	u := url.URL{
		Scheme: "https",
		Host:   "github.com",
		Path:   "/login/oauth/authorize",
		RawQuery: url.Values{
			"client_id": {clientID},
			"state":     {state},
		}.Encode(),
	}
	http.Redirect(w, req, u.String(), http.StatusFound)
}

func handleCallback(w http.ResponseWriter, req *http.Request) {
	code := req.URL.Query().Get("code")
	goon.DumpExpr(code)

	state := req.URL.Query().Get("state")
	goon.DumpExpr(state)

	req2, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(url.Values{
		"client_id":     {clientID},
		"client_secret": {secretID},
		"code":          {code},
	}.Encode()))
	if err != nil {
		panic(err)
	}
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req2.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req2)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	goon.DumpExpr(resp.Status)

	w.Header().Set("Content-Type", "text/plain")

	var token struct {
		AccessToken string `json:"access_token"`
	}
	err = json.NewDecoder(resp.Body).Decode(&token)
	if err != nil {
		panic(err)
	}

	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: token.AccessToken},
	)
	tc := oauth2.NewClient(oauth2.NoContext, ts)
	gh := github.NewClient(tc)

	user, _, err := gh.Users.Get("")
	if err != nil {
		panic(err)
	}
	goon.FdumpExpr(w, user)
}

func cryptoRandBase64String() string {
	b := make([]byte, 256)
	_, err := rand.Read(b)
	if err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
