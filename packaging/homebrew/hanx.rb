class Hanx < Formula
  desc "Local office document CLI, desktop setup, and MCP tools"
  homepage "https://studentsview.github.io/HanX/"
  version "2.11.0"
  license "MIT"

  on_macos do
    url "https://github.com/StudentsView/HanX/releases/download/v2.11.0/HanX-CLI-2.11.0-macOS.zip"
    sha256 "6b6b03d52fc33bebea9d4a536cdf5e91d5de5399c2e041fcbf27a0a5e872d6be"
    depends_on :macos => :ventura
  end
  on_linux do
    on_intel do
      url "https://github.com/StudentsView/HanX/releases/download/v2.11.0/HanX-CLI-2.11.0-linux-x64.tar.gz"
      sha256 "3d2d7e56f448e571e14cf336beed80d6a8b36ab9fb1a7d7a82ad4cd370b4fece"
    end
  end
  depends_on "node"

  resource "setup" do
    url "https://github.com/StudentsView/HanX/releases/download/v2.11.0/HanX-Setup-2.11.0.tar.gz"
    sha256 "555234e857e2fc854d3fce8b36d1f9dd99d9a1f8599495017332e4d9b90ea1d4"
  end

  def install
    platform = OS.mac? ? "darwin" : "linux"
    arch = Hardware::CPU.arm? ? "arm64" : "x64"
    native = libexec/"native/#{platform}-#{arch}"
    native.install Dir["*"]
    resource("setup").stage { libexec.install "bin", "lib", "package.json" }
    (bin/"hanx").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/hanx.js" "$@"
    SH
    bin.install_symlink "hanx" => "hanx-cli"
    pkgshare.install native/"LICENSE", native/"NOTICE"
  end

  def caveats
    <<~EOS
      CLI is ready. Run `hanx setup` to choose CLI only, GUI only, or both.
      Homebrew lifecycle installation never blocks on a prompt and never downloads a GUI.
      GUI-only keeps the small setup launcher and disables terminal document commands.
      The desktop app retains an internal engine. Linux GUI installation is per-user.
      PDF export may require a compatible local renderer; none is installed automatically.
    EOS
  end

  test do
    require "json"
    assert_equal version.to_s, JSON.parse(shell_output("#{bin}/hanx --version"))["data"]["version"]
    (testpath/"spec.json").write(JSON.generate({kind: "spreadsheet", sheets: [{name: "Data", rows: [[2], [4]], cells: {"B1" => "=SUM(A1:A2)"}}]}))
    system bin/"hanx", "create", "--spec", testpath/"spec.json", "--output", testpath/"test.xlsx"
    data = JSON.parse(shell_output("#{bin}/hanx spreadsheet read #{testpath}/test.xlsx --sheet Data --range B1"))
    assert_equal 6, data["data"]["cells"][0]["value"]
  end
end
