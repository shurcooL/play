// Play with streaming mutations from maintner.NewNetworkMutationSource.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"

	"github.com/davecgh/go-spew/spew"
	"golang.org/x/build/maintner"
	"golang.org/x/build/maintner/godata"
	"golang.org/x/build/maintner/maintpb"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		sigint := make(chan os.Signal, 1)
		signal.Notify(sigint, os.Interrupt)
		<-sigint
		cancel()
	}()

	err := run(ctx)
	if err != nil {
		log.Fatalln(err)
	}
}

var s struct {
	didInit bool
}

func run(ctx context.Context) error {
	src := maintner.NewNetworkMutationSource("https://maintner.golang.org/logs", godata.Dir())
Outer:
	for {
		ch := src.GetMutations(ctx)
		for {
			select {
			case <-ctx.Done():
				log.Printf("Context expired while loading data from log %T: %v", src, ctx.Err())
				return nil
			case e := <-ch:
				if e.Err != nil {
					log.Printf("Corpus GetMutations: %v", e.Err)
					return e.Err
				}
				if e.End {
					log.Printf("Reloaded data from log %T.", src)
					s.didInit = true
					continue Outer
				}
				processMutation(e.Mutation)
			}
		}
	}
}

func processMutation(m *maintpb.Mutation) {
	if !s.didInit {
		fmt.Print(".")
		return
	}

	spew.Dump(m)
}

/*
Comment on a Gerrit CL in scratch repo:

https://go-review.googlesource.com/c/scratch/+/103869#message-db37ecfee7c1a183be3922b22747bbe720e6d350

(*maintpb.Mutation)(gerrit:<project:"go.googlesource.com/scratch" commits:<sha1:"db37ecfee7c1a183be3922b22747bbe720e6d350" raw:"tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904\nparent 63631078fadc3ba85241e3f4109f2cf31a75affe\nauthor Dmitri Shuralyov <6005@62eb7196-b449-3ce5-99f1-c037f21e1705> 1523750271 +0000\ncommitter Gerrit Code Review <noreply-gerritcodereview@google.com> 1523750271 +0000\n\nUpdate patch set 1\n\nPatch Set 1:\n\nThis is a test comment in scratch repo. (Please ignore.)\n\nPatch-set: 1\nCC: Dmitri Shuralyov <6005@62eb7196-b449-3ce5-99f1-c037f21e1705>\n" diff_tree:<> > > )
(*maintpb.Mutation)(gerrit:<project:"go.googlesource.com/scratch" refs:<ref:"refs/changes/69/103869/meta" sha1:"db37ecfee7c1a183be3922b22747bbe720e6d350" > > )
*/
