// Gets issues that were closed during the current week for a GitHub organization, uses auth and memory cache.
package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"time"

	"github.com/google/go-github/github"
	"github.com/gregjones/httpcache"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/timeutil"
	"github.com/sourcegraph/apiproxy"
	"github.com/sourcegraph/apiproxy/service/github"
	"golang.org/x/oauth2"
)

func main() {
	orgNameFlag := flag.String("org-name", "", "Name of GitHub organization to get closed issues for (required).")
	flag.Parse()

	// Check for required flag value.
	if *orgNameFlag == "" {
		flag.Usage()
		os.Exit(2)
	}

	fmt.Println("Enter a GitHub token:")
	token, err := ioutil.ReadAll(os.Stdin)
	if err != nil {
		panic(err)
	}

	authTransport := &oauth2.Transport{
		Source: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: string(token)}),
	}

	memoryCacheTransport := httpcache.NewMemoryCacheTransport()
	memoryCacheTransport.Transport = authTransport

	transport := &apiproxy.RevalidationTransport{
		Transport: memoryCacheTransport,
		Check: (&githubproxy.MaxAge{
			User:         time.Hour * 24,
			Repository:   time.Hour * 24,
			Repositories: time.Hour * 24,
			Activity:     time.Hour * 12,
		}).Validator(),
	}
	httpClient := &http.Client{Transport: transport}

	client := github.NewClient(httpClient)

	for {
		startOfWeek := timeutil.StartOfWeek(time.Now())
		opt := &github.IssueListOptions{Filter: "all", State: "closed", Since: startOfWeek}
		//opt.ListOptions.PerPage = 1
		var allIssues, closedThisWeekIssues []github.Issue

		for {
			issues, resp, err := client.Issues.ListByOrg(*orgNameFlag, opt)
			goon.DumpExpr(resp.NextPage, resp.PrevPage, resp.FirstPage, resp.LastPage, resp.Rate.Remaining)
			if err != nil {
				panic(err)
			}

			allIssues = append(allIssues, issues...)

			if resp.NextPage != 0 {
				opt.ListOptions.Page = resp.NextPage
				continue
			}

			break
		}

		goon.DumpExpr(len(allIssues))

		for _, issue := range allIssues {
			if issue.ClosedAt.After(startOfWeek) {
				closedThisWeekIssues = append(closedThisWeekIssues, issue)
			}
		}

		goon.DumpExpr(len(closedThisWeekIssues))
		goon.DumpExpr(closedThisWeekIssues)

		time.Sleep(30 * time.Second)
	}
}
