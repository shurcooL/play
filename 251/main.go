// Learn about doing query batching with a Go GraphQL client
// by using reflection.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"reflect"
	"time"

	"github.com/shurcooL/githubv4"
	"golang.org/x/oauth2"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	// Authenticated GitHub API client with public repo scope.
	// (Since GraphQL API doesn't support unauthenticated clients at this time.)
	authTransport := &oauth2.Transport{
		Source: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: os.Getenv("GITHUB_TOKEN")}),
	}
	clV4 := githubv4.NewClient(&http.Client{Transport: authTransport, Timeout: 5 * time.Second})

	err := runBatch1(clV4)
	if err != nil {
		log.Println(err)
	}
	err = runBatch2(clV4)
	if err != nil {
		log.Println(err)
	}
	return nil
}

func runBatch1(clV4 *githubv4.Client) error {
	var q struct {
		Go struct {
			NameWithOwner string
			CreatedAt     time.Time
			Description   string
		} `graphql:"go: repository(owner: \"golang\", name: \"go\")"`
		GitHubV4 struct {
			NameWithOwner string
			CreatedAt     time.Time
			Description   string
		} `graphql:"graphql: repository(owner: \"shurcooL\", name: \"githubv4\")"`
	}
	err := clV4.Query(context.Background(), &q, nil)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "\t")
	err = enc.Encode(q)
	return err
}

func runBatch2(clV4 *githubv4.Client) error {
	q := reflect.New(reflect.StructOf([]reflect.StructField{
		{
			Name: "Go", Type: reflect.TypeOf(struct {
				NameWithOwner string
				CreatedAt     time.Time
				Description   string
			}{}), Tag: `graphql:"go: repository(owner: \"golang\", name: \"go\")"`,
		},
		{
			Name: "GitHubV4", Type: reflect.TypeOf(struct {
				NameWithOwner string
				CreatedAt     time.Time
				Description   string
			}{}), Tag: `graphql:"graphql: repository(owner: \"shurcooL\", name: \"githubv4\")"`,
		},
	})).Elem()
	err := clV4.Query(context.Background(), q.Addr().Interface(), nil)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "\t")
	err = enc.Encode(q.Interface())
	return err
}

/*{
	Name: "Go", Type: reflect.StructOf([]reflect.StructField{
		{Name: "NameWithOwner", Type: reflect.TypeOf(string(""))},
		{Name: "CreatedAt", Type: reflect.TypeOf(time.Time{})},
		{Name: "Description", Type: reflect.TypeOf(string(""))},
		{Name: "Issue", Type: reflect.TypeOf(struct {
			Title string
		}{}), Tag: `graphql:"issue(number: 1)"`},
	}), Tag: `graphql:"go: repository(owner: \"golang\", name: \"go\")"`,
},*/
