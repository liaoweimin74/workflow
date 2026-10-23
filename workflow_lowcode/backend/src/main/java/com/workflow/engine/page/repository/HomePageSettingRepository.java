package com.workflow.engine.page.repository;

import com.workflow.engine.page.entity.HomePageSetting;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HomePageSettingRepository extends JpaRepository<HomePageSetting, String> {
}
