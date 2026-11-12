require 'fiddle'
require 'fiddle/import'

module HolomorphicVis
  extend Fiddle::Importer

  # Автоматически находим скомпилированную библиотеку под Windows/Linux/macOS
  lib_ext = Gem.win_platform? ? 'dll' : (RUBY_PLATFORM.include?('darwin') ? 'dylib' : 'so')
  lib_path = File.expand_path("../build/holomorphic_vis.#{lib_ext}", __dir__)

  dlload lib_path

  extern 'int hv_transform_point(double, double, double, double, double, double*, double*, double*)'
  extern 'double hv_calc_market_hbi(double, double)'

  # Удобный Ruby-метод для конформного преобразования точки
  def self.transform(z, focus: Complex(0, 0), pan_x: 0.0)
    out_x = Fiddle::Pointer.malloc(8)
    out_y = Fiddle::Pointer.malloc(8)
    out_s = Fiddle::Pointer.malloc(8)

    is_pole = hv_transform_point(z.real, z.imag, focus.real, focus.imag, pan_x, out_x, out_y, out_s)
    return nil if is_pole == 1

    {
      point: Complex(out_x.to_s(8).unpack1('D'), out_y.to_s(8).unpack1('D')),
      scale: out_s.to_s(8).unpack1('D')
    }
  end

  # Прямой расчет индикатора бифуркации HBI в нативном D
  def self.market_hbi(momentum:, volatility:)
    hv_calc_market_hbi(momentum, volatility)
  end
end

# Быстрый самотест при прямом запуске файла
if __FILE__ == $0
  res = HolomorphicVis.transform(Complex(1.5, -0.5), focus: Complex(0.2, 0.1))
  hbi = HolomorphicVis.market_hbi(momentum: 0.45, volatility: 0.32)
  puts "Нативный вызов D из Ruby:"
  puts "  Трансформация: #{res[:point]} (масштаб: #{res[:scale].round(4)})"
  puts "  Индикатор HBI: #{hbi.round(4)}"
end
