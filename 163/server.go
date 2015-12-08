package stream

// Learn more at http://www.grpc.io/docs/tutorials/basic/go.html#bidirectional-streaming-rpc.

type server struct{}

func (server) ReceivePackStream(GitTransport_ReceivePackStreamServer) error {
	for {
        in, err := stream.Recv()
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }
        key := serialize(in.Location)
                ... // look for notes to be sent to client
        for _, note := range s.routeNotes[key] {
            if err := stream.Send(note); err != nil {
                return err
            }
        }
    }

}

func (server) UploadPackStream(GitTransport_UploadPackStreamServer) error {
	for {
        in, err := stream.Recv()
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }
        key := serialize(in.Location)
                ... // look for notes to be sent to client
        for _, note := range s.routeNotes[key] {
            if err := stream.Send(note); err != nil {
                return err
            }
        }
    }
}