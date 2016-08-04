// +build js

package main

import (
	"bytes"
	"html/template"
	"strings"
	"time"

	"go/build"

	"github.com/google/go-github/github"
	"github.com/shurcooL/go/gists/gist7480523"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()
var body = document.(dom.HTMLDocument).Body().(dom.Node)

func main() {
	{
		node := document.CreateElement("div")

		data := RepoCc{
			Repo: Repo{
				rootPath: "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/go",
				goPackages: []*gist7480523.GoPackage{
					&gist7480523.GoPackage{
						Bpkg: &build.Package{
							ImportPath: "github.com/shurcooL/go/github_flavored_markdown",
						},
					},
				},
			},
			Comparison: &GitHubComparison{
				cc: &github.CommitsComparison{
					Commits: []github.RepositoryCommit{
						{Commit: &github.Commit{Message: NewString("first message")}},
						{Commit: &github.Commit{Message: NewString("second change")}},
						{Commit: &github.Commit{Message: NewString("THIRD change woohoo!")}},
					},
				},
			},
		}

		var buf bytes.Buffer
		if err := t.Execute(&buf, data); err != nil {
			node.SetInnerHTML(err.Error())
		} else {
			node.SetInnerHTML(buf.String())
		}

		body.AppendChild(node)
	}

	time.Sleep(5 * time.Second)

	{
		node := document.CreateElement("div")
		node.SetInnerHTML("more things can come here")
		body.AppendChild(node)
	}

	time.Sleep(5 * time.Second)

	// Hide the "Checking for updates..." message.
	document.GetElementByID("checking_updates").(dom.HTMLElement).Style().SetProperty("display", "none", "")
}

// ---

var t = template.Must(template.New("repo").Parse(`<div class="list-entry" style="position: relative;">
	<div class="list-entry-header">
	{{/* TODO: Make this simpler. */}}
	{{if eq (len .Repo.GoPackages) 1}}
		<span title="{{.Repo.ImportPaths}}">
			{{if .Repo.WebLink}}
				<a href="{{.Repo.WebLink}}" target="_blank"><strong>{{(index .Repo.GoPackages 0).Bpkg.ImportPath}}</strong></a>
			{{else}}
				{{(index .Repo.GoPackages 0).Bpkg.ImportPath}}
			{{end}}
		</span></span>
	{{else}}
		<span title="{{.Repo.ImportPaths}}">
			{{if .Repo.WebLink}}
				<a href="{{.Repo.WebLink}}" target="_blank"><strong>{{.Repo.ImportPathPattern}}</strong></a>
			{{else}}
				{{.Repo.ImportPathPattern}}
			{{end}}
			<span class="smaller">({{len .Repo.GoPackages}} packages)</span></span>
	{{end}}

		<div style="float: right;">
			{{if true}}
				<a href="javascript:void(0)" onclick="update_go_package(this);" id="{{.Repo.ImportPathPattern}}" title="go get -u -d {{.Repo.ImportPathPattern}}">Update</a>
			{{else}}
				<span class="disabled">Updating...</span>
			{{end}}
		</div>
	</div>
	<div class="list-entry-body">
		<img style="float: left; border-radius: 4px;" src="{{.AvatarUrl}}" width="36" height="36">

		<div>
			{{if .Comparison}}
				<ul class="changes-list">
					{{range .Changes}}<li>{{.Commit.Message}}</li>
					{{end}}

					{{/*{{range $i, $_ := .Cc.Commits}}<li>{{(index $.Cc.Commits (revIndex $i (len $.Cc.Commits))).Commit.Message}}</li>
					{{end}}*/}}
				</ul>
			{{else}}
				<div class="changes-list">
					unknown changes
				</div>
			{{end}}
		</div>
		<div style="clear: both;"></div>
	</div>
</div>`))

type RepoCc struct {
	Repo       Repo
	Comparison *GitHubComparison
}

func (this RepoCc) AvatarUrl() template.URL {
	return "https://avatars0.githubusercontent.com/u/1924134?v=2&s=72"
	//return "https://github.com/images/gravatars/gravatar-user-420.png"
}

// List of changes, starting with the most recent.
// Precondition is that this.Comparison != nil.
/*func (this RepoCc) Changes() <-chan github.RepositoryCommit {
	out := make(chan github.RepositoryCommit)
	go func() {
		for index := range this.Comparison.cc.Commits {
			out <- this.Comparison.cc.Commits[len(this.Comparison.cc.Commits)-1-index]
		}
		close(out)
	}()
	return out
}*/

func (this RepoCc) Changes() []github.RepositoryCommit {
	return this.Comparison.cc.Commits
}

type GitHubComparison struct {
	cc *github.CommitsComparison
}

type Repo struct {
	rootPath   string
	goPackages []*gist7480523.GoPackage
}

func NewRepo(rootPath string, goPackages []*gist7480523.GoPackage) Repo {
	return Repo{rootPath, goPackages}
}

func (repo Repo) ImportPathPattern() string {
	return gist7480523.GetRepoImportPathPattern(repo.rootPath, repo.goPackages[0].Bpkg.SrcRoot)
}

func (repo Repo) RootPath() string                     { return repo.rootPath }
func (repo Repo) GoPackages() []*gist7480523.GoPackage { return repo.goPackages }

func (repo Repo) ImportPaths() string {
	var importPaths []string
	for _, goPackage := range repo.goPackages {
		importPaths = append(importPaths, goPackage.Bpkg.ImportPath)
	}
	return strings.Join(importPaths, "\n")
}

func (repo Repo) WebLink() *template.URL {
	goPackage := repo.goPackages[0]

	// TODO: Factor these out into a nice interface...
	switch {
	case strings.HasPrefix(goPackage.Bpkg.ImportPath, "github.com/"):
		importPathElements := strings.Split(goPackage.Bpkg.ImportPath, "/")
		url := template.URL("https://github.com/" + importPathElements[1] + "/" + importPathElements[2])
		return &url
	case strings.HasPrefix(goPackage.Bpkg.ImportPath, "gopkg.in/"):
		// TODO
		return nil
	case strings.HasPrefix(goPackage.Dir.Repo.VcsLocal.Remote, "https://github.com/"):
		url := template.URL(strings.TrimSuffix(goPackage.Dir.Repo.VcsLocal.Remote, ".git"))
		return &url
	default:
		return nil
	}
}

func NewString(s string) *string {
	return &s
}
