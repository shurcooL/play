// Play with walking Go repositories via sourcegraph/go-vcs.
package main

import (
	"fmt"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/shurcooL/go/vfs/godocfs/vfsutil"
	"sourcegraph.com/sourcegraph/go-vcs/vcs"
	"sourcegraph.com/sourcegraph/go-vcs/vcs/git"
	"sourcegraph.com/sourcegraph/go-vcs/vcs/gitcmd"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	const base = "/tmp/walkgorepos"

	for servProj := range gerritProjects {
		if servProj != "go.googlesource.com/oauth2" {
			continue
		}
		log.Printf("updating or cloning %v to %v ...\n", servProj, base)
		err := updateOrCloneRepository(filepath.Join(base, path.Base(servProj)), "https://"+servProj)
		if err != nil {
			return err
		}
	}
	log.Println("done")

	var existingDirectories = make(map[string]struct{})
	for servProj, repoRoot := range gerritProjects {
		if servProj != "go.googlesource.com/oauth2" {
			continue
		}
		dirs, err := walkRepository(filepath.Join(base, path.Base(servProj)), repoRoot,
			[]string{"master", "release-branch.go1.12", "release-branch.go1.11"})
		if err != nil {
			return fmt.Errorf("walkRepository(%q): %v", servProj, err)
		}
		for d := range dirs {
			existingDirectories[d] = struct{}{}
		}
	}
	for dir := range existingDirectories {
		fmt.Println(dir)
	}

	return nil
}

// gerritProjects maps each supported Gerrit "server/project" to
// the import path that corresponds to the root of that project.
var gerritProjects = map[string]string{
	"go.googlesource.com/go":         "",
	"go.googlesource.com/arch":       "golang.org/x/arch",
	"go.googlesource.com/benchmarks": "golang.org/x/benchmarks",
	"go.googlesource.com/blog":       "golang.org/x/blog",
	"go.googlesource.com/build":      "golang.org/x/build",
	"go.googlesource.com/crypto":     "golang.org/x/crypto",
	"go.googlesource.com/debug":      "golang.org/x/debug",
	"go.googlesource.com/exp":        "golang.org/x/exp",
	"go.googlesource.com/image":      "golang.org/x/image",
	"go.googlesource.com/lint":       "golang.org/x/lint",
	"go.googlesource.com/mobile":     "golang.org/x/mobile",
	"go.googlesource.com/net":        "golang.org/x/net",
	"go.googlesource.com/oauth2":     "golang.org/x/oauth2",
	"go.googlesource.com/perf":       "golang.org/x/perf",
	"go.googlesource.com/playground": "golang.org/x/playground",
	"go.googlesource.com/review":     "golang.org/x/review",
	"go.googlesource.com/sync":       "golang.org/x/sync",
	"go.googlesource.com/sys":        "golang.org/x/sys",
	"go.googlesource.com/talks":      "golang.org/x/talks",
	"go.googlesource.com/term":       "golang.org/x/term",
	"go.googlesource.com/text":       "golang.org/x/text",
	"go.googlesource.com/time":       "golang.org/x/time",
	"go.googlesource.com/tools":      "golang.org/x/tools",
	"go.googlesource.com/tour":       "golang.org/x/tour",
	"go.googlesource.com/vgo":        "golang.org/x/vgo",
}

func updateOrCloneRepository(gitDir, repoURL string) error {
	if r, err := gitcmd.Open(gitDir); err == nil {
		_, err := r.UpdateEverything(vcs.RemoteOpts{})
		r.Close()
		return err
	} else if r, err := gitcmd.Clone(repoURL, gitDir, vcs.CloneOpt{Bare: true, Mirror: true}); err == nil {
		r.Close()
		return nil
	} else {
		return err
	}
}

func walkRepository(gitDir, repoRoot string, branches []string) (map[string]struct{}, error) {
	r, err := git.Open(gitDir)
	if err != nil {
		return nil, err
	}
	defer func() {
		err := r.Close()
		if err != nil {
			log.Println("walkRepository: r.Close:", err)
		}
	}()
	var dirs = make(map[string]struct{})
	for _, branchName := range branches {
		branch, err := r.ResolveBranch(branchName)
		if err == vcs.ErrBranchNotFound && branchName != "master" {
			// Skip missing release branch.
			continue
		} else if err != nil {
			return nil, err
		}
		fs, err := r.FileSystem(branch)
		if err != nil {
			return nil, err
		}
		if repoRoot == "" {
			// Walk main Go repository.
			err := vfsutil.Walk(fs, "/src", func(dir string, fi os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				if dir == "/src" {
					// Skip root of "/src" of main Go repository.
					return nil
				}
				if !fi.IsDir() {
					// We only care about directories.
					return nil
				}
				if strings.HasPrefix(fi.Name(), ".") || strings.HasPrefix(fi.Name(), "_") || fi.Name() == "testdata" {
					return filepath.SkipDir
				}
				dirs[strings.TrimPrefix(dir, "/src/")] = struct{}{}
				return nil
			})
			if err != nil {
				return nil, err
			}
		} else {
			// Walk sub-repository.
			err := vfsutil.Walk(fs, "/", func(dir string, fi os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				if !fi.IsDir() {
					// We only care about directories.
					return nil
				}
				if strings.HasPrefix(fi.Name(), ".") || strings.HasPrefix(fi.Name(), "_") || fi.Name() == "testdata" {
					return filepath.SkipDir
				}
				dirs[path.Join(repoRoot, dir)] = struct{}{}
				return nil
			})
			if err != nil {
				return nil, err
			}
		}
	}
	return dirs, nil
}
