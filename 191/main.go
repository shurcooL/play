package main

import (
	"context"
	"net/http"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/issues/asanaapi/asana"
	"github.com/shurcooL/users/asanaapi"
	"golang.org/x/oauth2"
)

func main() {
	var transport http.RoundTripper = http.DefaultTransport
	if token := ""; token != "" {
		authTransport := &oauth2.Transport{
			Source: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token}),
		}
		transport = authTransport
	}
	an := asana.NewClient(&http.Client{Transport: transport})

	users := asanaapi.NewService(an)

	/*u, err := an.GetAuthenticatedUser(nil)
	goon.DumpExpr(u, err)*/

	u2, err := users.GetAuthenticated(context.TODO())
	goon.DumpExpr(u2, err)

	projects, err := an.ListProjects(nil)
	goon.DumpExpr(projects, err)
}
