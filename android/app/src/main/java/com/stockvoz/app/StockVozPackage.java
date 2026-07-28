package com.stockvoz.app;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Módulos nativos propios de StockVoz. */
public class StockVozPackage implements ReactPackage {

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext contexto) {
    List<NativeModule> modulos = new ArrayList<>();
    modulos.add(new SilenciadorAudioModule(contexto));
    return modulos;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext contexto) {
    return Collections.emptyList();
  }
}
