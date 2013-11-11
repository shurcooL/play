package main

import (
	"io"
	//"net/http"
	"log"
	//"html"
	"fmt"
	"os"
	"os/exec"
	//"strconv"
	"time"
	//"flag"

	. "gist.github.com/5571468.git"
	"github.com/howeyc/fsnotify"
)

func checkError(err error) {
	if nil != err {
		log.Fatal(err)
	}
}

func main() {
	if 2 != len(os.Args) {
		fmt.Fprintln(os.Stderr, "usage: ./watcher file\n (where file.go is the source of another program)")
		os.Exit(1)
	}

	var path string = os.Args[1]
	var restart bool = true
	var process *os.Process
	var processState *os.ProcessState
	var oldContent string = TryReadFile(path + ".go")

	// Setup a watcher
	{
		var watcher *fsnotify.Watcher = nil

		// Create a new watcher
		{
			var err error
			watcher, err = fsnotify.NewWatcher()
			checkError(err)

			defer watcher.Close()
		}

		// Process events functions
		go func() {
			for {
				select {
				case /*ev :=*/ <-watcher.Event:
					{
						//log.Printf("Event: %v.\n", ev)

						// Check if the file has been changed externally, and if so, override this widget
						newContent := TryReadFile(path + ".go")
						if newContent == oldContent {
							continue
						} else {
							oldContent = newContent
						}

						restart = true

						if nil != process {
							if processState == nil || !processState.Exited() {
								//err := process.Kill()
								err := process.Signal(os.Interrupt)
								checkError(err)
								//fmt.Printf("Killed process %v.\n", process.Pid)
							}
							process = nil
							processState = nil
						}
					}

				case err := <-watcher.Error:
					{
						checkError(err)
					}
				}
			}
		}()

		// Start watching the source file
		{
			err := watcher.Watch(path + ".go")
			checkError(err)
		}
	}

	// Main loop
	for {
		for !restart {
			time.Sleep(1 * time.Second)
		}
		restart = false

		// Build the program, wait for completion
		{
			cmd := exec.Command("go", "build", "-o", path, path+".go")
			err := cmd.Run()
			if err != nil {
				continue
			}
		}

		// Run the program, wait for completion
		{
			fmt.Printf("%s\n", path)

			cmd := exec.Command(path)

			stdout, err := cmd.StdoutPipe()
			checkError(err)
			stderr, err := cmd.StderrPipe()
			checkError(err)

			err = cmd.Start()
			checkError(err)

			process = cmd.Process

			go io.Copy(os.Stdout, stdout)
			go io.Copy(os.Stderr, stderr)

			cmd.Wait()
			processState = cmd.ProcessState

			fmt.Printf("\n")
		}
	}
}
