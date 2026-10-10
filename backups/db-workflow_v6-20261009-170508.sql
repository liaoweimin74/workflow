/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.6-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: workflow_v6
-- ------------------------------------------------------
-- Server version	11.8.6-MariaDB-0+deb13u1 from Debian

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Current Database: `workflow_v6`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `workflow_v6` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;

USE `workflow_v6`;

--
-- Table structure for table `flyway_schema_history`
--

DROP TABLE IF EXISTS `flyway_schema_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flyway_schema_history` (
  `installed_rank` int(11) NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int(11) DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT current_timestamp(),
  `execution_time` int(11) NOT NULL,
  `success` tinyint(1) NOT NULL,
  PRIMARY KEY (`installed_rank`),
  KEY `flyway_schema_history_s_idx` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flyway_schema_history`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flyway_schema_history` WRITE;
/*!40000 ALTER TABLE `flyway_schema_history` DISABLE KEYS */;
INSERT INTO `flyway_schema_history` VALUES
(1,'1','baseline schema','SQL','V1__baseline_schema.sql',650178947,'node-migrator','2026-09-23 14:47:09',8,1),
(2,'2','init data','SQL','V2__init_data.sql',1139911049,'node-migrator','2026-09-23 14:47:09',5,1),
(3,'3','grant admin menus','SQL','V3__grant_admin_menus.sql',810571147,'node-migrator','2026-09-23 14:47:09',2,1),
(4,'4','create wf node config','SQL','V4__create_wf_node_config.sql',1634819904,'node-migrator','2026-09-23 14:47:09',1,1),
(5,'5','create wf category','SQL','V5__create_wf_category.sql',1723544693,'node-migrator','2026-09-23 14:47:09',7,1),
(6,'6','create wf process draft','SQL','V6__create_wf_process_draft.sql',664068881,'node-migrator','2026-09-23 14:47:09',1,1),
(7,'7','add process management menus','SQL','V7__add_process_management_menus.sql',1190223043,'node-migrator','2026-09-23 14:47:09',2,1),
(8,'8','add last deployed at','SQL','V8__add_last_deployed_at.sql',1003492481,'node-migrator','2026-09-23 14:47:09',4,1),
(9,'9','fix version and deployed at','SQL','V9__fix_version_and_deployed_at.sql',717164960,'node-migrator','2026-09-23 14:47:09',0,1),
(10,'11','add category menu','SQL','V11__add_category_menu.sql',840182847,'node-migrator','2026-09-23 14:47:09',0,1),
(11,'12','create form tables','SQL','V12__create_form_tables.sql',-1358903684,'node-migrator','2026-09-23 14:47:09',3,1),
(12,'13','create wf task comment','SQL','V13__create_wf_task_comment.sql',-112966394,'node-migrator','2026-09-23 14:47:09',1,1),
(13,'14','create wf task transfer','SQL','V14__create_wf_task_transfer.sql',726975210,'node-migrator','2026-09-23 14:47:09',1,1),
(14,'15','add process category permissions','SQL','V15__add_process_category_permissions.sql',894892465,'node-migrator','2026-09-23 14:47:09',1,1),
(15,'16','create wf task remind','SQL','V16__create_wf_task_remind.sql',1528080298,'node-migrator','2026-09-23 14:47:09',3,1),
(16,'17','clear form def data','SQL','V17__clear_form_def_data.sql',-1322388170,'node-migrator','2026-09-23 14:47:09',2,1),
(17,'18','add deployed config hash','SQL','V18__add_deployed_config_hash.sql',430291177,'node-migrator','2026-09-23 14:47:09',2,1),
(18,'19','form def add type and column config','SQL','V19__form_def_add_type_and_column_config.sql',-76474991,'node-migrator','2026-09-23 14:47:09',5,1),
(19,'20','create wf page def','SQL','V20__create_wf_page_def.sql',333882923,'node-migrator','2026-09-23 14:47:09',3,1),
(20,'21','merge form view menus','SQL','V21__merge_form_view_menus.sql',-522814584,'node-migrator','2026-09-23 14:47:09',21,1),
(21,'22','add form id to data source','SQL','V22__add_form_id_to_data_source.sql',-1008722349,'node-migrator','2026-09-23 14:47:09',13,1),
(22,'23','add page data source id','SQL','V23__add_page_data_source_id.sql',-492092031,'node-migrator','2026-09-23 14:47:09',5,1),
(23,'24','create notification tables','SQL','V24__create_notification_tables.sql',1442754333,'node-migrator','2026-09-23 14:47:09',7,1),
(24,'25','optimize retry index','SQL','V25__optimize_retry_index.sql',629559468,'node-migrator','2026-09-23 14:47:09',2,1),
(25,'26','add notification menus','SQL','V26__add_notification_menus.sql',2047030466,'node-migrator','2026-09-23 14:47:09',2,1),
(26,'27','unify notification tenant type','SQL','V27__unify_notification_tenant_type.sql',1390673949,'node-migrator','2026-09-23 14:47:09',14,1),
(27,'28','add message content type','SQL','V28__add_message_content_type.sql',-2141586872,'node-migrator','2026-09-23 14:47:09',9,1),
(28,'29','add notification event definitions','SQL','V29__add_notification_event_definitions.sql',-103859050,'node-migrator','2026-09-23 14:47:09',61,1),
(29,'30','add form def process key','SQL','V30__add_form_def_process_key.sql',2118263784,'node-migrator','2026-09-23 14:47:09',3,1),
(30,'31','add source key unique','SQL','V31__add_source_key_unique.sql',-996958868,'node-migrator','2026-09-23 14:47:09',3,1),
(31,'32','create engine runtime tables','SQL','V32__create_engine_runtime_tables.sql',-2026819748,'node-migrator','2026-09-23 14:47:09',11,1),
(32,'33','add process def target namespace','SQL','V33__add_process_def_target_namespace.sql',-232587996,'node-migrator','2026-09-23 14:47:09',3,1),
(33,'34','wfe timestamps microsecond','SQL','V34__wfe_timestamps_microsecond.sql',1761348934,'node-migrator','2026-09-23 14:47:09',17,1),
(34,'35','align hibernate added schema','SQL','V35__align_hibernate_added_schema.sql',-485857535,'node-migrator','2026-09-23 14:47:09',53,1),
(35,'36','create task delegation','SQL','V36__create_task_delegation.sql',607377456,'node-migrator','2026-09-23 14:47:09',2,1),
(36,'37','add instance lock version','SQL','V37__add_instance_lock_version.sql',-1909082123,'node-migrator','2026-09-23 14:47:09',1,1),
(37,'38','fix node config unique key','SQL','V38__fix_node_config_unique_key.sql',-44417256,'node-migrator','2026-09-23 14:47:09',5,1),
(38,'39','builtin data sources','SQL','V39__builtin_data_sources.sql',-473665810,'node-migrator','2026-09-24 09:09:15',14,1),
(39,'40','create engine notify','SQL','V40__create_engine_notify.sql',-61291012,'node-migrator','2026-09-27 10:43:07',2,1),
(40,'41','add task comment signature','SQL','V41__add_task_comment_signature.sql',-1623754221,'node-migrator','2026-09-27 15:59:50',29,1);
/*!40000 ALTER TABLE `flyway_schema_history` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_channel_config`
--

DROP TABLE IF EXISTS `msg_channel_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_channel_config` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL COMMENT '渠道类型',
  `config_key` varchar(64) NOT NULL COMMENT '配置键；__enabled 为保留键（渠道启停开关）',
  `config_value` text DEFAULT NULL COMMENT '配置值；is_encrypted=1 时为密文',
  `is_encrypted` bit(1) NOT NULL DEFAULT b'0' COMMENT '值是否加密存储',
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_channel_config` (`channel`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='渠道运行时配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_channel_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_channel_config` WRITE;
/*!40000 ALTER TABLE `msg_channel_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_channel_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_delivery_retry`
--

DROP TABLE IF EXISTS `msg_delivery_retry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_delivery_retry` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `recipient_id` bigint(20) NOT NULL COMMENT '收件人ID',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `retry_count` int(11) NOT NULL DEFAULT 0 COMMENT '重试次数',
  `max_retry` int(11) NOT NULL DEFAULT 3 COMMENT '最大重试次数',
  `last_error` text DEFAULT NULL COMMENT '最后一次错误',
  `next_retry_at` datetime DEFAULT NULL COMMENT '下次重试时间',
  `status` varchar(16) NOT NULL COMMENT '状态',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `message_id` bigint(20) NOT NULL DEFAULT 0 COMMENT '消息ID（重试时据此重建内容）',
  PRIMARY KEY (`id`),
  KEY `idx_recipient` (`recipient_id`),
  KEY `idx_next_retry` (`next_retry_at`),
  KEY `idx_retry_status_next` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息路由失败重试记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_delivery_retry`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_delivery_retry` WRITE;
/*!40000 ALTER TABLE `msg_delivery_retry` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_delivery_retry` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_event_definition`
--

DROP TABLE IF EXISTS `msg_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_event_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `event_code` varchar(64) NOT NULL COMMENT '业务事件代码',
  `event_name` varchar(128) NOT NULL COMMENT '事件名称',
  `description` varchar(500) DEFAULT NULL COMMENT '事件说明',
  `business_domain` varchar(64) DEFAULT NULL COMMENT '业务领域',
  `enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_by` varchar(64) NOT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_by` varchar(64) DEFAULT NULL COMMENT '更新人',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_tenant_code` (`tenant_id`,`event_code`),
  KEY `idx_event_tenant_enabled` (`tenant_id`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息业务事件定义';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_event_definition` WRITE;
/*!40000 ALTER TABLE `msg_event_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_message`
--

DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_message` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `template_code` varchar(64) NOT NULL COMMENT '模板代码',
  `sender_id` bigint(20) NOT NULL COMMENT '发送者ID',
  `sender_type` varchar(32) NOT NULL COMMENT '发送者类型 (SYSTEM, USER)',
  `title` varchar(255) NOT NULL COMMENT '消息标题',
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '消息内容 (JSON)' CHECK (json_valid(`content`)),
  `link_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT '链接信息 (JSON)' CHECK (json_valid(`link_json`)),
  `priority` varchar(16) NOT NULL COMMENT '消息优先级',
  `category` varchar(16) NOT NULL COMMENT '消息类别',
  `message_type` varchar(16) NOT NULL COMMENT '消息类型',
  `content_type` enum('TEXT','MARKDOWN') DEFAULT NULL COMMENT '内容渲染类型 (TEXT/MARKDOWN)',
  `status` varchar(16) NOT NULL COMMENT '消息状态',
  `created_at` datetime DEFAULT current_timestamp(),
  `event_code` varchar(64) DEFAULT NULL COMMENT '业务事件代码',
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_template` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_message`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_message` WRITE;
/*!40000 ALTER TABLE `msg_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_message` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_recipient`
--

DROP TABLE IF EXISTS `msg_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_recipient` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `message_id` bigint(20) NOT NULL COMMENT '消息ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `username` varchar(64) NOT NULL COMMENT '用户名',
  `nickname` varchar(64) DEFAULT NULL COMMENT '昵称',
  `email` varchar(255) DEFAULT NULL COMMENT '邮箱',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `status` varchar(16) NOT NULL COMMENT '消息状态',
  `sent_at` datetime DEFAULT NULL COMMENT '发送时间',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message` (`message_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收件人表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_recipient`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_recipient` WRITE;
/*!40000 ALTER TABLE `msg_recipient` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_recipient` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_subscription_rule`
--

DROP TABLE IF EXISTS `msg_subscription_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_subscription_rule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `event_code` varchar(64) NOT NULL COMMENT '事件代码',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `priority` varchar(16) DEFAULT NULL COMMENT '优先级',
  `enable` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  `condition_expr` text DEFAULT NULL COMMENT '条件表达式',
  `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `created_at` datetime DEFAULT current_timestamp(),
  `action` varchar(16) NOT NULL DEFAULT 'ALLOW' COMMENT '规则动作',
  PRIMARY KEY (`id`),
  KEY `idx_event_channel` (`event_code`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅规则表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_subscription_rule`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_subscription_rule` WRITE;
/*!40000 ALTER TABLE `msg_subscription_rule` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_subscription_rule` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_template`
--

DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_template` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `template_code` varchar(64) NOT NULL COMMENT '模板代码',
  `name` varchar(128) NOT NULL COMMENT '模板名称',
  `title` varchar(255) DEFAULT NULL COMMENT '标题模板',
  `content` text DEFAULT NULL COMMENT '内容模板',
  `channel` varchar(16) DEFAULT NULL COMMENT '渠道类型',
  `priority` varchar(16) DEFAULT NULL COMMENT '默认优先级',
  `category` varchar(16) DEFAULT NULL COMMENT '默认类别',
  `is_system` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为系统模板',
  `created_at` datetime DEFAULT current_timestamp(),
  `event_code` varchar(64) DEFAULT NULL COMMENT '业务事件代码',
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL COMMENT '内容渲染类型（TEXT/MARKDOWN）',
  `enabled` bit(1) NOT NULL DEFAULT b'1' COMMENT '是否启用（停用后发送被拒绝）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_template` (`tenant_id`,`template_code`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息模板表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_template`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_template` WRITE;
/*!40000 ALTER TABLE `msg_template` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_template` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_user_subscription`
--

DROP TABLE IF EXISTS `msg_user_subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_user_subscription` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) NOT NULL COMMENT '租户ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `username` varchar(64) NOT NULL COMMENT '用户名',
  `channel` varchar(16) NOT NULL COMMENT '渠道类型',
  `subscribed` tinyint(1) NOT NULL DEFAULT 1 COMMENT '是否订阅',
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user_channel` (`tenant_id`,`user_id`,`channel`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_user_subscription`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_user_subscription` WRITE;
/*!40000 ALTER TABLE `msg_user_subscription` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_user_subscription` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `value` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `dict_name` varchar(100) NOT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn09exsucyqm2v79fwvep1wtn9` (`dict_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `menu_name` varchar(100) NOT NULL,
  `menu_type` int(11) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `path` varchar(200) DEFAULT NULL,
  `permission` varchar(100) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=265 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES
(1,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,'Setting','系统管理',0,NULL,'/system',NULL,1,1),
(2,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/user/index','User','用户管理',1,1,'/system/user','system:user:list',1,1),
(3,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/role/index','UserFilled','角色管理',1,1,'/system/role','system:role:list',2,1),
(4,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/menu/index','Menu','菜单管理',1,1,'/system/menu','system:menu:list',3,1),
(5,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/org/index','Organization','组织机构',1,1,'/system/org','system:org:list',4,1),
(6,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'system/dict/index','List','字典管理',1,1,'/system/dict','system:dict:list',5,1),
(7,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'dashboard/index','HomeFilled','首页',1,NULL,'/dashboard',NULL,0,1),
(8,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户查询',2,2,NULL,'system:user:query',1,1),
(9,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户新增',2,2,NULL,'system:user:create',2,1),
(10,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户修改',2,2,NULL,'system:user:update',3,1),
(11,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'用户删除',2,2,NULL,'system:user:delete',4,1),
(12,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色查询',2,3,NULL,'system:role:query',1,1),
(13,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色新增',2,3,NULL,'system:role:create',2,1),
(14,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色修改',2,3,NULL,'system:role:update',3,1),
(15,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'角色删除',2,3,NULL,'system:role:delete',4,1),
(16,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单查询',2,4,NULL,'system:menu:query',1,1),
(17,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单新增',2,4,NULL,'system:menu:create',2,1),
(18,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单修改',2,4,NULL,'system:menu:update',3,1),
(19,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'菜单删除',2,4,NULL,'system:menu:delete',4,1),
(20,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构查询',2,5,NULL,'system:org:query',1,1),
(21,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构新增',2,5,NULL,'system:org:create',2,1),
(22,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构修改',2,5,NULL,'system:org:update',3,1),
(23,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'机构删除',2,5,NULL,'system:org:delete',4,1),
(24,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典查询',2,6,NULL,'system:dict:query',1,1),
(25,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典新增',2,6,NULL,'system:dict:create',2,1),
(26,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典修改',2,6,NULL,'system:dict:update',3,1),
(27,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'字典删除',2,6,NULL,'system:dict:delete',4,1),
(100,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,'Operation','流程管理',0,NULL,'/process',NULL,2,1),
(101,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessListPage','Document','流程定义',1,100,'/process/definition','process:definition:list',1,1),
(102,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessCenterPage','Files','流程中心',1,100,'/process/center','process:center:list',2,1),
(103,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,'process/ProcessTodoPage','BellFilled','待办处理',1,100,'/process/todo','process:todo:list',3,1),
(110,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程创建',2,101,NULL,'process:definition:create',1,1),
(111,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程部署',2,101,NULL,'process:definition:deploy',2,1),
(112,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 15:50:57.000000',NULL,NULL,NULL,'流程删除',2,101,NULL,'process:definition:delete',3,1),
(113,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类创建',2,104,NULL,'process:category:create',1,1),
(114,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类编辑',2,104,NULL,'process:category:update',2,1),
(115,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'分类删除',2,104,NULL,'process:category:delete',3,1),
(120,'2026-09-23 14:47:09.000000',NULL,1,'2026-09-23 14:47:09.000000',NULL,NULL,'Tickets','表单管理',0,NULL,'/form',NULL,3,0),
(121,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'form/FormListPage','Document','表单列表',1,160,'/form','form:list',1,1),
(130,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单创建',2,121,NULL,'form:create',1,1),
(131,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单编辑',2,121,NULL,'form:edit',2,1),
(132,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单发布',2,121,NULL,'form:publish',3,1),
(133,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'表单删除',2,121,NULL,'form:delete',4,1),
(140,'2026-09-23 14:47:09.000000',NULL,1,'2026-09-23 14:47:09.000000',NULL,NULL,'Grid','查询界面管理',0,NULL,'/page',NULL,4,0),
(141,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'page/PageListPage','Document','页面列表',1,160,'/page','page:list',1,1),
(142,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'dataSource/DataSourceListPage','Connection','数据源管理',1,160,'/data-source/list','data-source:list',2,1),
(150,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面创建',2,141,NULL,'page:create',1,1),
(151,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面编辑',2,141,NULL,'page:edit',2,1),
(152,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面发布',2,141,NULL,'page:publish',3,1),
(153,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'页面删除',2,141,NULL,'page:delete',4,1),
(154,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'数据源管理',2,142,NULL,'data-source:manage',1,1),
(160,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'Grid','表单视图管理',0,NULL,'/form',NULL,3,1),
(250,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'Bell','消息管理',0,NULL,'/messages',NULL,5,1),
(251,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/MessageCenter','Message','消息中心',1,250,'/messages','notification:message:list',1,1),
(252,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/TemplateList','Document','模板管理',1,250,'/messages/templates','notification:template:list',2,1),
(253,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/ChannelConfig','Connection','渠道配置',1,250,'/messages/channels','notification:channel:list',3,1),
(254,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/SubscriptionRules','SetUp','订阅规则',1,250,'/messages/subscriptions','notification:subscription:list',4,1),
(255,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/DeliveryLog','Tickets','发送记录',1,250,'/messages/deliveries','notification:delivery:list',5,1),
(256,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'模板管理',2,252,NULL,'notification:template:manage',1,1),
(257,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'渠道配置',2,253,NULL,'notification:channel:manage',1,1),
(258,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'订阅规则',2,254,NULL,'notification:subscription:manage',1,1),
(259,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'发送记录重发',2,255,NULL,'notification:delivery:retry',1,1),
(260,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/AnnouncementList','Notification','公告管理',1,250,'/messages/announcements','notification:announcement:list',6,1),
(261,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'modules/notification/views/admin/EventDefinitionList','Operation','事件管理',1,250,'/messages/events','notification:event:list',7,1),
(262,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'公告管理',2,260,NULL,'notification:announcement:manage',1,1),
(263,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,NULL,'事件管理',2,261,NULL,'notification:event:manage',1,1),
(264,'2026-09-25 10:31:10.775000',NULL,0,'2026-09-25 10:31:10.775000',NULL,'page/PageRenderer',NULL,'演示页面1',1,160,'/page/test1','page:read:test1',0,1);
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_organization`
--

DROP TABLE IF EXISTS `sys_organization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_organization` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `org_code` varchar(50) NOT NULL,
  `org_name` varchar(100) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK1dm1ss9gn66mtn1m0dyb9bsyp` (`org_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_organization`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_organization` WRITE;
/*!40000 ALTER TABLE `sys_organization` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_organization` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `role_code` varchar(50) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjqdita2l45v2gglry7bp8kl1f` (`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES
(1,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'系统超级管理员','ROLE_ADMIN','超级管理员',1),
(2,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,'系统普通用户','ROLE_USER','普通用户',1);
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `menu_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES
(1,1,1),
(2,2,1),
(3,3,1),
(4,4,1),
(5,5,1),
(6,6,1),
(7,7,1),
(8,8,1),
(9,9,1),
(10,10,1),
(11,11,1),
(12,12,1),
(13,13,1),
(14,14,1),
(15,15,1),
(16,16,1),
(17,17,1),
(18,18,1),
(19,19,1),
(20,20,1),
(21,21,1),
(22,22,1),
(23,23,1),
(24,24,1),
(25,25,1),
(26,26,1),
(27,27,1),
(32,100,1),
(33,101,1),
(34,102,1),
(35,103,1),
(36,110,1),
(37,111,1),
(38,112,1),
(39,120,1),
(40,121,1),
(41,130,1),
(42,131,1),
(43,132,1),
(44,133,1),
(46,113,1),
(47,114,1),
(48,115,1),
(49,140,1),
(50,141,1),
(51,142,1),
(52,150,1),
(53,151,1),
(54,152,1),
(55,153,1),
(56,154,1),
(64,160,1),
(65,250,1),
(66,251,1),
(67,252,1),
(68,253,1),
(69,254,1),
(70,255,1),
(71,256,1),
(72,257,1),
(73,258,1),
(74,259,1),
(80,260,1),
(81,261,1),
(82,262,1),
(83,263,1),
(84,264,1);
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `org_id` bigint(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK51bvuyvihefoh4kp5syh2jpi4` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES
(1,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'admin@workflow.com','管理员',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'admin'),
(2,'2026-09-23 14:47:09.000000',NULL,0,'2026-09-23 14:47:09.000000',NULL,NULL,'test@workflow.com','测试用户',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'test');
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `role_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKhh52n8vd4ny9ff4x9fb8v65qx` (`role_id`),
  KEY `FKb40xxfch70f5qnyfw8yme1n1s` (`user_id`),
  CONSTRAINT `FKb40xxfch70f5qnyfw8yme1n1s` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `FKhh52n8vd4ny9ff4x9fb8v65qx` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES
(1,1,1),
(2,2,2);
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf4tjek39`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf4tjek39`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf4tjek39` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `leave_type` varchar(255) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf4tjek39`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf4tjek39` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf52ksu88`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf52ksu88`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf52ksu88` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` int(11) NOT NULL,
  `registration_date` date NOT NULL,
  `remarks` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf52ksu88`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf52ksu88` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf58a5n38`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf58a5n38`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf58a5n38` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `applicant_name` varchar(255) NOT NULL,
  `department` varchar(255) NOT NULL,
  `reimbursement_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`reimbursement_type`)),
  `details` text DEFAULT NULL,
  `amount` int(11) NOT NULL,
  `attachment` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `reimbursement_type_text` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf58a5n38`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf58a5n38` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_bill_test`
--

DROP TABLE IF EXISTS `wf_biz_bill_test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_bill_test` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `person_id` varchar(255) DEFAULT NULL,
  `person_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `leave_start_date` date NOT NULL,
  `leave_end_date` date NOT NULL,
  `leave_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`leave_type`)),
  `leave_type_text` varchar(255) DEFAULT NULL,
  `leave_days` int(11) NOT NULL,
  `leave_reason` text NOT NULL,
  `contact_phone` varchar(255) NOT NULL,
  `is_approved` varchar(255) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_bill_test`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_bill_test` WRITE;
/*!40000 ALTER TABLE `wf_biz_bill_test` DISABLE KEYS */;
INSERT INTO `wf_biz_bill_test` VALUES
('78459b7180f6a44e562616c0f741a907','default','1','admin','1','1','2026-09-25','2026-09-25','\"personal\"','事假',1,'1','1','yes',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_bill_test` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_category`
--

DROP TABLE IF EXISTS `wf_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_category` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `parent_id` varchar(64) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_category`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_category` WRITE;
/*!40000 ALTER TABLE `wf_category` DISABLE KEYS */;
INSERT INTO `wf_category` VALUES
('64f4802b34e352e3da0d7aeb9fa71de2','default','请假流程',NULL,1,'2026-09-24 08:44:04'),
('9fc5266c8e07a5ac9adf80494049bbe2','default','报销流程',NULL,2,'2026-09-24 08:44:17');
/*!40000 ALTER TABLE `wf_category` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_data_source`
--

DROP TABLE IF EXISTS `wf_data_source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_data_source` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL COMMENT '数据源名称（租户内唯一，设计器下拉显示）',
  `type` varchar(32) NOT NULL COMMENT 'FORM / SYSTEM / API',
  `form_key` varchar(255) DEFAULT NULL COMMENT 'type=FORM：绑定的业务表单 key → wf_biz_<form_key>',
  `source_key` varchar(255) DEFAULT NULL COMMENT 'type=SYSTEM/API：注册表 key（dept-tree / external-stock 等）',
  `params` longtext DEFAULT NULL COMMENT 'type=API：静态参数 JSON',
  `status` varchar(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / ENABLED / DISABLED',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `form_id` varchar(64) DEFAULT NULL COMMENT '关联的业务表单ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ds_tenant_name` (`tenant_id`,`name`),
  UNIQUE KEY `uk_ds_tenant_source_key` (`tenant_id`,`source_key`),
  KEY `idx_ds_tenant_type` (`tenant_id`,`type`),
  KEY `idx_wf_data_source_form_id` (`form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='全局数据源（业务表单/系统结构/第三方API）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_data_source`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_data_source` WRITE;
/*!40000 ALTER TABLE `wf_data_source` DISABLE KEYS */;
INSERT INTO `wf_data_source` VALUES
('089688bb7ce443e1a9ab56b7b62ab27d','default','费用报销审批流程表单 数据源','WORKFLOW','ai_muimil5t78','ai_muimil5t78',NULL,'ENABLED','system','2026-09-27 00:48:10','2026-09-27 00:48:10','299f7fcdfde04c309f8339772f44b604'),
('12cc1853648942ea8608dd53b4f43ee2','default','AI小智测试表单 数据源','WORKFLOW','ai_xiaozhi_test','ai_xiaozhi_test',NULL,'ENABLED','system','2026-09-24 13:05:27','2026-09-24 13:05:27','8a1c28f22312b38ba4414914e6b504cf'),
('1cc15d6e514842869f324fb13da0d9ce','default','办公用品登记业务表单 数据源','FORM','ai_muf52ksu88','ai_muf52ksu88','{\"list\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"DELETE\"}}','ENABLED','system','2026-09-24 14:16:31','2026-09-25 02:05:14','9e24468dbcf5e57cdeeddcc7934e629f'),
('3f014ac986314285ae2216bd24dc433e','default','办公用品领用流程表单 数据源','WORKFLOW','ai_muimnle734','ai_muimnle734',NULL,'ENABLED','system','2026-09-27 00:52:03','2026-09-27 00:52:03','e13dba23da7ce03c664dc626db550605'),
('40dae5b2311f4be9a4379a3022e23a52','default','会议室预约业务表单 数据源','FORM','ai_muf5sckj12','ai_muf5sckj12',NULL,'ENABLED','system','2026-09-24 14:36:33','2026-09-24 15:01:37','648b850b40637d18d6dcdd90211a84fb'),
('50613845c2674d1e9037b6986a6c163c','default','出差申请审批流程表单 数据源','WORKFLOW','ai_muimm9du49','ai_muimm9du49',NULL,'ENABLED','system','2026-09-27 00:51:01','2026-09-27 00:51:01','088678179269fbc56c5c157386ccbbb3'),
('869f98e37736434e9e1d551dac877628','default','员工请假审批流程表单 数据源','WORKFLOW','ai_muimc7p374','ai_muimc7p374',NULL,'ENABLED','system','2026-09-27 00:43:12','2026-09-27 00:43:12','73fc3be4d32a2d1b704f022eb61d1f99'),
('91ec520d8f484b68b9307398fe2e15c0','default','员工报销申请 数据源','FORM','ai_muf58a5n38','ai_muf58a5n38',NULL,'ENABLED','system','2026-09-24 14:20:57','2026-09-24 15:00:55','579351c3534ce256077a37b017b91430'),
('cc78ce9ddc784f04ba4b8871285e5779','default','会议室预约表单 数据源','FORM','ai_muf7u70h84','ai_muf7u70h84',NULL,'ENABLED','system','2026-09-24 15:33:58','2026-09-24 15:33:58','e6d2ffd44a6baf0d26f10a99d656c705'),
('dda21b336e3d444d9370aa881316106b','default','员工请假业务表单 数据源','FORM','ai_muf4tjek39','ai_muf4tjek39',NULL,'ENABLED','system','2026-09-24 14:09:29','2026-09-24 15:26:21','e6ab86607aca0f4dce285f108687f67a'),
('ds-builtin-dept-tree','system','组织机构','SYSTEM',NULL,'dept-tree','{\"list\":{\"action\":\"/api/v1/internal/system/dept-tree\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-process-definitions','system','流程定义','SYSTEM',NULL,'process-definitions','{\"list\":{\"action\":\"/api/v1/internal/system/process/definitions\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-process-instances','system','流程实例','SYSTEM',NULL,'process-instances','{\"list\":{\"action\":\"/api/v1/internal/system/process/instances\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-sys-dicts','system','系统字典','SYSTEM',NULL,'sys-dicts','{\"list\":{\"action\":\"/api/v1/internal/system/dicts\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-sys-menus','system','系统菜单','SYSTEM',NULL,'sys-menus','{\"list\":{\"action\":\"/api/v1/internal/system/menus\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-sys-roles','system','系统角色','SYSTEM',NULL,'sys-roles','{\"list\":{\"action\":\"/api/v1/internal/system/roles\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-todo-tasks','system','待办任务','SYSTEM',NULL,'todo-tasks','{\"list\":{\"action\":\"/api/v1/internal/system/process/todo-tasks\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('ds-builtin-user-tree','system','系统用户','SYSTEM',NULL,'user-tree','{\"list\":{\"action\":\"/api/v1/internal/system/users\",\"method\":\"GET\"}}','ENABLED','system','2026-09-24 16:23:57','2026-09-24 16:23:57',NULL),
('e6741228ebda42fb8fa0c5717800d27a','default','测试表单 数据源','FORM','bill_test','bill_test','{\"list\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"DELETE\"},\"queryMode\":\"config\",\"joins\":[{\"targetFormKey\":\"user-tree\",\"localField\":\"person_id\",\"foreignField\":\"id\",\"joinField\":\"username\",\"virtualKey\":\"apply_name\",\"label\":\"申请人姓名\",\"sortable\":true,\"filterable\":true}]}','ENABLED','system','2026-09-24 00:23:43','2026-09-25 08:19:04','9dc27e83b084a95bb4230f60fd92bc34');
/*!40000 ALTER TABLE `wf_data_source` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_engine_notify`
--

DROP TABLE IF EXISTS `wf_engine_notify`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_engine_notify` (
  `id` varchar(64) NOT NULL COMMENT 'UUID',
  `tenant_id` varchar(64) NOT NULL DEFAULT 'default' COMMENT '租户 ID',
  `instance_id` varchar(64) NOT NULL COMMENT '流程实例 ID',
  `task_id` varchar(64) DEFAULT NULL COMMENT '关联任务 ID（实例级通知为 NULL）',
  `notify_type` varchar(32) NOT NULL COMMENT '通知类型：SMS_NODE/SMS_END/TIMEOUT_REMIND',
  `target_user` varchar(64) NOT NULL COMMENT '目标用户 ID',
  `content` varchar(500) NOT NULL COMMENT '通知内容',
  `status` varchar(16) NOT NULL DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SENT/FAILED',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_engine_notify_instance` (`instance_id`),
  KEY `idx_engine_notify_target` (`target_user`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='引擎外发通知记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_engine_notify`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_engine_notify` WRITE;
/*!40000 ALTER TABLE `wf_engine_notify` DISABLE KEYS */;
INSERT INTO `wf_engine_notify` VALUES
('e0e71cb4-8426-6809-bbe8-800a1d96ebea','default','db15967d-0195-3468-3f14-b27279a25082','28b5adad-7c5a-f40a-e1ee-df7faa5f74ca','SMS_NODE','1','您有新的办理任务：经理审批','PENDING','2026-09-27 18:50:15.180');
/*!40000 ALTER TABLE `wf_engine_notify` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_data`
--

DROP TABLE IF EXISTS `wf_form_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_data` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `form_def_id` varchar(64) NOT NULL,
  `form_version` int(11) NOT NULL,
  `process_instance_id` varchar(64) DEFAULT NULL,
  `task_id` varchar(64) DEFAULT NULL,
  `data_json` longtext DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_snapshot` bit(1) NOT NULL DEFAULT b'0' COMMENT '1=审批快照（不可变），0=当前数据',
  PRIMARY KEY (`id`),
  KEY `idx_form_data_def_proc` (`form_def_id`,`process_instance_id`),
  KEY `idx_form_data_tenant_proc` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='表单实例数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_data` WRITE;
/*!40000 ALTER TABLE `wf_form_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_form_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_def`
--

DROP TABLE IF EXISTS `wf_form_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_def` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `key` varchar(255) NOT NULL,
  `schema` longtext DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `status` varchar(32) NOT NULL DEFAULT 'DRAFT',
  `published_version` int(11) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `type` varchar(20) NOT NULL DEFAULT 'WORKFLOW',
  `column_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`column_config`)),
  `process_key` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_form_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='表单定义';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_def` WRITE;
/*!40000 ALTER TABLE `wf_form_def` DISABLE KEYS */;
INSERT INTO `wf_form_def` VALUES
('579351c3534ce256077a37b017b91430','default','员工报销申请','ai_muf58a5n38','{\"rule\":[{\"type\":\"input\",\"field\":\"applicant_name\",\"title\":\"报销人姓名\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写报销人姓名\"}],\"_fc_id\":\"id_F1jcmuf6lj9hc1c\",\"name\":\"ref_Fwjdmuf6lj9hc2c\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"department\",\"title\":\"部门\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写部门\"}],\"_fc_id\":\"id_Fv2lmuf6lj9hc3c\",\"name\":\"ref_F40ymuf6lj9hc4c\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"select\",\"field\":\"reimbursement_type\",\"title\":\"报销类型\",\"value\":null,\"options\":[{\"label\":\"差旅费\",\"value\":\"差旅费\"},{\"label\":\"办公费\",\"value\":\"办公费\"},{\"label\":\"招待费\",\"value\":\"招待费\"},{\"label\":\"其他\",\"value\":\"其他\"}],\"validate\":[{\"required\":true,\"message\":\"请选择报销类型\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fzhcmuf6lj9hc5c\",\"name\":\"ref_F7evmuf6lj9hc6c\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"amount\",\"title\":\"金额\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写金额\"}],\"_fc_id\":\"id_F8ztmuf6lj9ic9c\",\"name\":\"ref_F7bsmuf6lj9icac\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"attachment\",\"title\":\"附件\",\"value\":null,\"_fc_id\":\"id_F0y9muf6lj9icbc\",\"name\":\"ref_Fx8ymuf6lj9iccc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"员工报销申请\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"员工报销申请\"},\"dataSources\":[],\"actions\":[]}',1,'PUBLISHED',1,NULL,'2026-09-24 14:20:57','2026-09-24 15:00:55','BUSINESS','[{\"key\":\"applicant_name\",\"label\":\"报销人姓名\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"department\",\"label\":\"部门\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"reimbursement_type\",\"label\":\"报销类型\",\"columnType\":\"JSON\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"select\"},{\"key\":\"reimbursement_type_text\",\"label\":\"报销类型（显示）\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"selectText\"},{\"key\":\"amount\",\"label\":\"金额\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"attachment\",\"label\":\"附件\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"}]',NULL),
('648b850b40637d18d6dcdd90211a84fb','default','会议室预约业务表单','ai_muf5sckj12','{\"rule\":[{\"type\":\"input\",\"field\":\"meeting_room_name\",\"title\":\"会议室名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写会议室名称\",\"mode\":\"required\"}],\"_fc_id\":\"id_F9fymuf6nsmxcec\",\"name\":\"ref_F5v8muf6nsmxcfc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"},{\"type\":\"input\",\"field\":\"booker_name\",\"title\":\"预约人\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写预约人\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fy0jmuf6nsmycgc\",\"name\":\"ref_Fcwwmuf6nsmychc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"会议室预约业务表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[],\"actions\":[]}',1,'DRAFT',NULL,NULL,'2026-09-24 14:36:33','2026-09-24 15:01:37','BUSINESS','[{\"key\":\"meeting_room_name\",\"label\":\"会议室名称\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booker_name\",\"label\":\"预约人\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booking_date\",\"label\":\"预约日期\",\"columnType\":\"DATETIME\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"date\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"purpose\",\"label\":\"使用事由\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"inputTextarea\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null}]',NULL),
('8a1c28f22312b38ba4414914e6b504cf','default','AI小智测试表单','ai_xiaozhi_test','[]',1,'DRAFT',NULL,NULL,'2026-09-24 13:05:27','2026-09-24 13:05:27','WORKFLOW',NULL,NULL),
('9d2130c4f642deab4f27f09cbede4a9a','default','暗色测试表单','','[]',1,'ARCHIVED',NULL,NULL,'2026-09-24 10:46:07','2026-09-24 11:00:58','WORKFLOW',NULL,NULL),
('9dc27e83b084a95bb4230f60fd92bc34','default','测试表单','bill_test','{\"rule\":[{\"type\":\"input\",\"field\":\"person_id\",\"title\":\"请假人id\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_F5d7muf892qxayc\",\"name\":\"ref_Fa9tmuf892qxazc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":true},{\"type\":\"LookupPicker\",\"field\":\"person_name\",\"title\":\"请假人姓名\",\"props\":{\"columns\":[{\"prop\":\"username\",\"label\":\"用户名\"}],\"returnFields\":{},\"dataSourceId\":\"ds_mufbo50u\",\"displayField\":\"username\",\"searchColumns\":[\"username\",\"nickname\"],\"idField\":\"person_id\"},\"_fc_id\":\"id_Ftakmuf87tulavc\",\"name\":\"ref_F5xqmuf87tulawc\",\"_fc_drag_tag\":\"LookupPicker\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"department\",\"title\":\"所属部门\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写所属部门\"}],\"_fc_id\":\"id_Fy1umuf877w5adc\",\"name\":\"ref_F7frmuf877w5aec\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"position\",\"title\":\"职位\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写职位\"}],\"_fc_id\":\"id_Fa3lmuf877w5afc\",\"name\":\"ref_Ftvrmuf877w5agc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"leave_start_date\",\"title\":\"请假开始日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择请假开始日期\",\"mode\":\"required\"}],\"_fc_id\":\"id_F0xqmuf877w5ahc\",\"name\":\"ref_Fgynmuf877w5aic\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"leave_end_date\",\"title\":\"请假结束日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择请假结束日期\"}],\"_fc_id\":\"id_Fmzkmuf877w5ajc\",\"name\":\"ref_Fdkkmuf877w5akc\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"select\",\"field\":\"leave_type\",\"title\":\"请假类型\",\"value\":null,\"options\":[{\"label\":\"年假\",\"value\":\"annual\"},{\"label\":\"病假\",\"value\":\"sick\"},{\"label\":\"事假\",\"value\":\"personal\"},{\"label\":\"婚假\",\"value\":\"marriage\"},{\"label\":\"产假\",\"value\":\"maternity\"},{\"label\":\"其他\",\"value\":\"other\"}],\"validate\":[{\"required\":true,\"message\":\"请选择请假类型\"}],\"_fc_id\":\"id_Fblmmuf877w5alc\",\"name\":\"ref_Ffwdmuf877w5amc\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"leave_days\",\"title\":\"请假天数\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写请假天数\"}],\"_fc_id\":\"id_Fwwfmuf877w5anc\",\"name\":\"ref_Fudfmuf877w5aoc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"textarea\",\"field\":\"leave_reason\",\"title\":\"请假事由\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写请假事由\"}],\"_fc_id\":\"id_Fechmuf877w5apc\",\"name\":\"ref_Flbgmuf877w5aqc\",\"_fc_drag_tag\":\"textarea\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"contact_phone\",\"title\":\"紧急联系电话\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写紧急联系电话\"}],\"_fc_id\":\"id_Fisxmuf877w5arc\",\"name\":\"ref_F5ltmuf877w5asc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"radio\",\"field\":\"is_approved\",\"title\":\"是否已获得主管批准\",\"value\":null,\"options\":[{\"label\":\"是\",\"value\":\"yes\"},{\"label\":\"否\",\"value\":\"no\"}],\"validate\":[{\"required\":true,\"message\":\"请选择是否已获得主管批准\"}],\"_fc_id\":\"id_Fzjqmuf877w5atc\",\"name\":\"ref_Fv2lmuf877w5auc\",\"_fc_drag_tag\":\"radio\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"测试表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"测试表单\"},\"dataSources\":[{\"id\":\"ds_mufbo50u\",\"refId\":\"ds-builtin-user-tree\",\"name\":\"系统用户\"}],\"actions\":[]}',1,'PUBLISHED',1,NULL,'2026-09-24 00:23:43','2026-09-24 17:22:03','BUSINESS','[{\"key\":\"person_id\",\"label\":\"请假人id\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\",\"hidden\":true},{\"key\":\"person_name\",\"label\":\"请假人姓名\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"LookupPicker\",\"pickerConfig\":\"{\\\"displayField\\\":\\\"username\\\",\\\"mode\\\":\\\"single\\\",\\\"pickerType\\\":\\\"lookupPicker\\\"}\"},{\"key\":\"department\",\"label\":\"所属部门\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"position\",\"label\":\"职位\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"leave_start_date\",\"label\":\"请假开始日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"leave_end_date\",\"label\":\"请假结束日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"leave_type\",\"label\":\"请假类型\",\"columnType\":\"JSON\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"select\"},{\"key\":\"leave_type_text\",\"label\":\"请假类型（显示）\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"selectText\"},{\"key\":\"leave_days\",\"label\":\"请假天数\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"leave_reason\",\"label\":\"请假事由\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"textarea\"},{\"key\":\"contact_phone\",\"label\":\"紧急联系电话\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"is_approved\",\"label\":\"是否已获得主管批准\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"radio\"}]',NULL),
('9e24468dbcf5e57cdeeddcc7934e629f','default','办公用品登记业务表单','ai_muf52ksu88','{\"rule\":[{\"type\":\"input\",\"field\":\"item_name\",\"title\":\"物品名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写物品名称\"}],\"_fc_id\":\"id_F9pumuf6p6ricmc\",\"name\":\"ref_Famfmuf6p6ricnc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"quantity\",\"title\":\"数量\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写数量\"}],\"_fc_id\":\"id_F4esmuf6p6ricoc\",\"name\":\"ref_Furfmuf6p6ricpc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"unit_price\",\"title\":\"单价\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写单价\"}],\"_fc_id\":\"id_Fqqhmuf6p6ricqc\",\"name\":\"ref_Fbinmuf6p6ricrc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"registration_date\",\"title\":\"登记日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写登记日期\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fxcfmuf6p6ricsc\",\"name\":\"ref_F91fmuf6p6rictc\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"remarks\",\"title\":\"备注\",\"value\":null,\"_fc_id\":\"id_Fedcmuf6p6ricuc\",\"name\":\"ref_Fd6zmuf6p6ricvc\",\"props\":{\"type\":\"textarea\"},\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"办公用品登记业务表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"办公用品登记业务表单\"},\"dataSources\":[],\"actions\":[]}',1,'PUBLISHED',1,NULL,'2026-09-24 14:16:31','2026-09-24 15:31:06','BUSINESS','[{\"key\":\"item_name\",\"label\":\"物品名称\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"quantity\",\"label\":\"数量\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"unit_price\",\"label\":\"单价\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"registration_date\",\"label\":\"登记日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"remarks\",\"label\":\"备注\",\"columnType\":\"TEXT\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"}]',NULL),
('bcc2dd12143ec3b48dd4d4ba61f4eff0','default','会议室预约业务表单','ai_muf7u4ul55','[]',1,'DRAFT',NULL,NULL,'2026-09-24 15:33:56','2026-09-24 15:33:56','BUSINESS',NULL,NULL),
('e6ab86607aca0f4dce285f108687f67a','default','员工请假业务表单','ai_muf4tjek39','{\"rule\": [{\"type\": \"input\", \"field\": \"name\", \"title\": \"姓名\", \"value\": null, \"validate\": [{\"required\": true, \"message\": \"请填写姓名\"}]}, {\"type\": \"input\", \"field\": \"department\", \"title\": \"部门\", \"value\": null, \"validate\": [{\"required\": true, \"message\": \"请填写部门\"}]}, {\"type\": \"select\", \"field\": \"leave_type\", \"title\": \"请假类型\", \"value\": null, \"options\": [{\"label\": \"事假\", \"value\": \"事假\"}, {\"label\": \"病假\", \"value\": \"病假\"}, {\"label\": \"年假\", \"value\": \"年假\"}], \"validate\": [{\"required\": true, \"message\": \"请选择请假类型\"}]}, {\"type\": \"datePicker\", \"field\": \"start_date\", \"title\": \"开始日期\", \"value\": null}, {\"type\": \"datePicker\", \"field\": \"end_date\", \"title\": \"结束日期\", \"value\": null}, {\"type\": \"input\", \"field\": \"reason\", \"title\": \"请假事由\", \"value\": null, \"props\": {\"type\": \"textarea\"}}]}',1,'PUBLISHED',1,NULL,'2026-09-24 14:09:29','2026-09-24 15:26:21','BUSINESS','[{\"key\": \"name\", \"label\": \"姓名\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"department\", \"label\": \"部门\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"leave_type\", \"label\": \"请假类型\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"select\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"start_date\", \"label\": \"开始日期\", \"columnType\": \"DATETIME\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"datePicker\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"end_date\", \"label\": \"结束日期\", \"columnType\": \"DATETIME\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"datePicker\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"reason\", \"label\": \"请假事由\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}]',NULL),
('e6d2ffd44a6baf0d26f10a99d656c705','default','会议室预约表单','ai_muf7u70h84','{\"rule\":[{\"type\":\"input\",\"field\":\"meeting_room_name\",\"title\":\"会议室名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写会议室名称\"}]},{\"type\":\"input\",\"field\":\"booker_name\",\"title\":\"预约人\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写预约人\"}]},{\"type\":\"datePicker\",\"field\":\"booking_time\",\"title\":\"预约时间\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择预约时间\"}]},{\"type\":\"input\",\"field\":\"cancellation_reason\",\"title\":\"取消原因\",\"value\":null}]}',1,'DRAFT',NULL,NULL,'2026-09-24 15:33:58','2026-09-24 15:33:58','BUSINESS','[{\"key\":\"meeting_room_name\",\"label\":\"会议室名称\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booker_name\",\"label\":\"预约人\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booking_time\",\"label\":\"预约时间\",\"columnType\":\"DATETIME\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"datePicker\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"cancellation_reason\",\"label\":\"取消原因\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null}]',NULL);
/*!40000 ALTER TABLE `wf_form_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_node_config`
--

DROP TABLE IF EXISTS `wf_node_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_node_config` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `process_def_id` varchar(64) NOT NULL,
  `node_id` varchar(255) NOT NULL,
  `node_type` varchar(64) NOT NULL,
  `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`config_json`)),
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `process_definition_id` varchar(64) DEFAULT NULL COMMENT '非空表示该行是某部署版本的节点配置快照',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_node_version` (`tenant_id`,`process_def_id`,`node_id`,`process_definition_id`),
  KEY `idx_def` (`tenant_id`,`process_def_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_node_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_node_config` WRITE;
/*!40000 ALTER TABLE `wf_node_config` DISABLE KEYS */;
INSERT INTO `wf_node_config` VALUES
('620c09cff56403f62728b00748a26e93','default','f50d6d7a012aea6df8710a35de24b267','__PROCESS__','unknown','{\"approvalPolicy\":{\"deduplication\":{\"enabled\":false,\"scope\":\"GLOBAL\",\"mode\":\"CONSECUTIVE\",\"action\":\"AUTO_PASS\",\"skipSameAsInitiator\":false},\"operations\":{\"allowReject\":true,\"allowAddSign\":true,\"allowTransfer\":true,\"allowDelegate\":true},\"commentPolicy\":{\"enabled\":false,\"scope\":\"REJECT_RETURN\"},\"signaturePolicy\":{\"enabled\":false,\"useLast\":false,\"allowUpload\":false,\"required\":false},\"comment\":{\"disabled\":false,\"disallowDelete\":false,\"disallowAttachment\":false},\"approveRecall\":false,\"retakeSkipApproved\":false},\"titleRule\":{\"enabled\":false,\"pattern\":\"\"},\"summaryRule\":{\"enabled\":false,\"fields\":[],\"showInSms\":false},\"dynamicProcess\":false,\"timeoutRules\":[],\"starterScope\":{\"mode\":\"ALL\",\"userIds\":[],\"roleIds\":[]},\"adminUserIds\":[],\"numberRule\":{\"enabled\":false,\"pattern\":\"{{year}}-{{seq:4}}\"}}','2026-09-30 01:42:56','2026-09-30 01:42:56',NULL),
('950eabcf4ef6761e6aa9fe2ea22d9dff','default','f50d6d7a012aea6df8710a35de24b267','__PROCESS__','unknown','{\"approvalPolicy\":{\"deduplication\":{\"enabled\":false,\"scope\":\"GLOBAL\",\"mode\":\"CONSECUTIVE\",\"action\":\"AUTO_PASS\",\"skipSameAsInitiator\":false},\"operations\":{\"allowReject\":true,\"allowAddSign\":true,\"allowTransfer\":true,\"allowDelegate\":true},\"commentPolicy\":{\"enabled\":false,\"scope\":\"REJECT_RETURN\"},\"signaturePolicy\":{\"enabled\":false,\"useLast\":false,\"allowUpload\":false,\"required\":false},\"comment\":{\"disabled\":false,\"disallowDelete\":false,\"disallowAttachment\":false},\"approveRecall\":false,\"retakeSkipApproved\":false},\"titleRule\":{\"enabled\":false,\"pattern\":\"\"},\"summaryRule\":{\"enabled\":false,\"fields\":[],\"showInSms\":false},\"dynamicProcess\":false,\"timeoutRules\":[],\"starterScope\":{\"mode\":\"ALL\",\"userIds\":[],\"roleIds\":[]},\"adminUserIds\":[],\"numberRule\":{\"enabled\":false,\"pattern\":\"{{year}}-{{seq:4}}\"}}','2026-09-30 02:06:19','2026-09-30 02:06:19','ui_verify_flow:1:1f4f614e-f2a4-6e5f-3ee6-59d5fccd12a4');
/*!40000 ALTER TABLE `wf_node_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_page_def`
--

DROP TABLE IF EXISTS `wf_page_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_page_def` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL COMMENT '页面名称',
  `key` varchar(255) NOT NULL COMMENT '页面标识（租户内唯一）',
  `type` varchar(32) NOT NULL DEFAULT 'VIEW' COMMENT 'VIEW=视图 / PAGE=自定义页面',
  `form_key` varchar(255) DEFAULT NULL COMMENT '绑定的业务表单 key → wf_biz_<form_key>（VIEW 用）',
  `data_source_id` varchar(64) DEFAULT NULL COMMENT '视图绑定数据源ID',
  `schema` longtext DEFAULT NULL COMMENT 'VIEW=视图配置JSON / PAGE=form-create {rule,option,dataSources,actions}',
  `version` int(11) NOT NULL DEFAULT 1,
  `status` varchar(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
  `published_version` int(11) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_page_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_page_def_tenant_form` (`tenant_id`,`form_key`),
  KEY `idx_page_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='页面定义（视图/自定义页面）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_page_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_page_def` WRITE;
/*!40000 ALTER TABLE `wf_page_def` DISABLE KEYS */;
INSERT INTO `wf_page_def` VALUES
('ccade5ed0f68e55315b0e0834867c436','default','测试页面','test1','PAGE',NULL,NULL,'{\"rule\":[{\"type\":\"page-table\",\"field\":\"table1790295600611\",\"title\":\"\",\"props\":{\"dataSourceId\":\"ds_mug7s41d\",\"border\":true,\"stripe\":true,\"columns\":[{\"prop\":\"apply_name\",\"label\":\"申请人姓名\"},{\"prop\":\"leave_end_date\",\"label\":\"请假结束日期\"},{\"prop\":\"leave_start_date\",\"label\":\"请假开始日期\"},{\"prop\":\"leave_days\",\"label\":\"请假天数\"},{\"prop\":\"leave_type\",\"label\":\"请假类型\"},{\"prop\":\"person_name\",\"label\":\"请假人姓名\"},{\"prop\":\"department\",\"label\":\"所属部门\"},{\"prop\":\"leave_reason\",\"label\":\"请假事由\"},{\"prop\":\"is_approved\",\"label\":\"是否已获得主管批准\"},{\"prop\":\"contact_phone\",\"label\":\"紧急联系电话\"},{\"prop\":\"position\",\"label\":\"职位\"}],\"sortable\":false,\"filterable\":false,\"pagination\":true,\"selectionMode\":\"none\",\"actionColumnWidth\":0,\"showSearch\":true,\"stretch\":true,\"searchFields\":[],\"sortableFields\":[\"person_name\",\"department\",\"position\",\"leave_start_date\",\"leave_end_date\",\"leave_days\",\"contact_phone\",\"is_approved\",\"apply_name\"],\"pageSize\":20,\"pageSizes\":[10,20,50],\"viewActions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"编辑\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"delete\",\"label\":\"删除\",\"placement\":\"column\",\"style\":\"icon\"}],\"permissions\":\"\"},\"viewDetail\":{\"width\":\"800px\",\"type\":\"form\"},\"viewEvents\":[],\"designMode\":true},\"_fc_id\":\"id_Fqfrmug7ryebabc\",\"name\":\"ref_Fos4mug7ryebacc\",\"_fc_drag_tag\":\"page-table\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[{\"id\":\"ds_mug7s41d\",\"refId\":\"e6741228ebda42fb8fa0c5717800d27a\",\"name\":\"测试表单 数据源\"}],\"actions\":[]}',1,'PUBLISHED',1,NULL,'2026-09-25 00:34:44','2026-09-27 13:55:41');
/*!40000 ALTER TABLE `wf_page_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_process_draft`
--

DROP TABLE IF EXISTS `wf_process_draft`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_draft` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `key` varchar(255) DEFAULT NULL COMMENT 'V6 遗留列，已被 process_key 取代；保留数据但不再写入',
  `category_id` varchar(64) DEFAULT NULL,
  `bpmn_xml` longtext NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'DRAFT',
  `process_definition_id` varchar(64) DEFAULT NULL,
  `deploy_id` varchar(64) DEFAULT NULL,
  `last_deployed_at` datetime DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deployed_config_hash` varchar(64) DEFAULT NULL COMMENT '上次部署时的配置hash（XML+节点配置整体指纹）',
  `process_key` varchar(255) NOT NULL DEFAULT '' COMMENT '设计器里的流程 key（实体映射列）',
  `deployed_xml` longtext DEFAULT NULL COMMENT '最近一次部署时的 BPMN XML 快照',
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_wf_draft_key` (`tenant_id`,`key`),
  KEY `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_draft`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_process_draft` WRITE;
/*!40000 ALTER TABLE `wf_process_draft` DISABLE KEYS */;
INSERT INTO `wf_process_draft` VALUES
('4f10a0d7bf698bca3eeae99dd132d5a1','default','请假',NULL,'64f4802b34e352e3da0d7aeb9fa71de2','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"64f4802b34e352e3da0d7aeb9fa71de2\">\n  <bpmn:process id=\"leave\" name=\"请假\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\"/>\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"leave\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Rect x=\"160\" y=\"160\" width=\"36\" height=\"36\"/>\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>','DRAFT',NULL,NULL,NULL,0,NULL,'2026-09-27 21:54:59','2026-09-27 21:54:59',NULL,'leave',NULL),
('f50d6d7a012aea6df8710a35de24b267','default','UI验证流程',NULL,NULL,'<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UI验证流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','DEPLOYED','ui_verify_flow:1:1f4f614e-f2a4-6e5f-3ee6-59d5fccd12a4','ebeedebc-a08a-a49e-b50b-d75ef7811064','2026-09-30 02:06:19',1,NULL,'2026-09-30 01:18:47','2026-09-30 02:06:19','041b3974db57dece93836aedb001faf160851101f5364cecf304c70fedb108fd','ui_verify_flow','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UI验证流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n');
/*!40000 ALTER TABLE `wf_process_draft` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_comment`
--

DROP TABLE IF EXISTS `wf_task_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_comment` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `comment` text DEFAULT NULL,
  `signature` longtext DEFAULT NULL COMMENT '手写签名 dataURL（signature.enabled 节点提交时存储，action=approve）',
  `action` varchar(32) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `target_user_id` varchar(64) DEFAULT NULL COMMENT '加签/转办/抄送的目标用户',
  PRIMARY KEY (`id`),
  KEY `idx_comment_task` (`tenant_id`,`task_id`),
  KEY `idx_comment_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_comment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_comment` WRITE;
/*!40000 ALTER TABLE `wf_task_comment` DISABLE KEYS */;
INSERT INTO `wf_task_comment` VALUES
('0b38bcc9fce5cf8bb3fe047e7426699f','default','c453e067-ab35-5315-0dd3-7625a5458bd6','db15967d-0195-3468-3f14-b27279a25082','1','行政备案完成',NULL,'approve','2026-09-27 18:53:32',NULL),
('9b9375dec97b58cd4871a751cd94f7b8','default','db37eb61-71a8-7476-fa55-6ebfface00bd','db15967d-0195-3468-3f14-b27279a25082','1',NULL,NULL,'submit','2026-09-27 18:50:15',NULL),
('c7100ea7294be862b14234c6cf2886bd','default','28b5adad-7c5a-f40a-e1ee-df7faa5f74ca','db15967d-0195-3468-3f14-b27279a25082','1','同意，浏览器E2E验证',NULL,'approve','2026-09-27 18:51:22',NULL);
/*!40000 ALTER TABLE `wf_task_comment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_remind`
--

DROP TABLE IF EXISTS `wf_task_remind`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_remind` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `remind_from` varchar(64) NOT NULL,
  `remind_to` varchar(64) NOT NULL,
  `remind_time` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_remind_task` (`tenant_id`,`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_remind`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_remind` WRITE;
/*!40000 ALTER TABLE `wf_task_remind` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_remind` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_transfer`
--

DROP TABLE IF EXISTS `wf_task_transfer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_transfer` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `from_user` varchar(64) NOT NULL,
  `to_user` varchar(64) NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_transfer_task` (`tenant_id`,`task_id`),
  KEY `idx_transfer_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_transfer`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_transfer` WRITE;
/*!40000 ALTER TABLE `wf_task_transfer` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_transfer` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_activity`
--

DROP TABLE IF EXISTS `wfe_activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_activity` (
  `id` varchar(64) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `execution_id` varchar(64) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL,
  `node_type` varchar(64) NOT NULL,
  `node_name` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL COMMENT 'ACTIVE / COMPLETED / CANCELLED',
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `duration_ms` bigint(20) DEFAULT NULL,
  `mi_root_id` varchar(64) DEFAULT NULL,
  `mi_index` int(11) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_instance_status` (`instance_id`,`status`),
  KEY `idx_instance_node` (`instance_id`,`node_id`),
  KEY `idx_mi_root` (`mi_root_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='活动实例（运行+历史统一，替代 ACT_HI_ACTINST）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_activity`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_activity` WRITE;
/*!40000 ALTER TABLE `wfe_activity` DISABLE KEYS */;
INSERT INTO `wfe_activity` VALUES
('0be77a15-e2fd-2264-c75a-a2758a697838','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','ai_task_3','multiInstanceBody',NULL,'ACTIVE','2026-09-27 18:51:22.064000',NULL,NULL,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('1db0e5f0-4784-41e0-bd76-aa0c67a00949','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','flow_3','sequenceFlow',NULL,'COMPLETED','2026-09-27 18:51:22.062000','2026-09-27 18:51:22.063000',1,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('24e8c124-72ac-5f60-5b06-c0f50ed33ad0','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','flow_2','sequenceFlow',NULL,'COMPLETED','2026-09-27 18:50:15.181000','2026-09-27 18:50:15.182000',1,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('516db898-96df-ae90-58e5-f069d1bd3921','db15967d-0195-3468-3f14-b27279a25082','0100b17c-8254-567d-bb4e-9526f544a286','ai_task_3','userTask',NULL,'COMPLETED','2026-09-27 18:51:22.065000','2026-09-27 18:53:32.473000',130408,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',0,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('5b58312b-e696-3f2f-23c0-f4d0bd3c8b00','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','startEvent_1','startEvent',NULL,'COMPLETED','2026-09-27 18:50:15.173000','2026-09-27 18:50:15.174000',1,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('94f01635-1d07-598b-533d-11e90cf9deb5','db15967d-0195-3468-3f14-b27279a25082','d5b8567b-8fbd-9286-a35a-66c452d69e8b','endEvent_1','endEvent',NULL,'COMPLETED','2026-09-27 18:53:32.476000','2026-09-27 18:53:32.477000',1,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('b935a656-3511-b524-b003-0818f9c92814','db15967d-0195-3468-3f14-b27279a25082','d5b8567b-8fbd-9286-a35a-66c452d69e8b','flow_4','sequenceFlow',NULL,'COMPLETED','2026-09-27 18:53:32.474000','2026-09-27 18:53:32.475000',1,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('bc0ff16a-af0f-1a16-af33-c690e2c751f1','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','ai_task_2','userTask',NULL,'COMPLETED','2026-09-27 18:50:15.183000','2026-09-27 18:51:22.061000',66878,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('db10bcb2-5438-ae41-a90f-b9368e2b5258','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','ai_task_1','userTask',NULL,'COMPLETED','2026-09-27 18:50:15.177000','2026-09-27 18:50:15.180000',3,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('e98f975a-f57e-f69a-d5a0-39104c5dde5f','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','flow_1','sequenceFlow',NULL,'COMPLETED','2026-09-27 18:50:15.175000','2026-09-27 18:50:15.176000',1,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000');
/*!40000 ALTER TABLE `wfe_activity` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_execution`
--

DROP TABLE IF EXISTS `wfe_execution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_execution` (
  `id` varchar(64) NOT NULL COMMENT 'token ID',
  `instance_id` varchar(64) NOT NULL,
  `parent_id` varchar(64) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL COMMENT '当前 BPMN 元素 ID',
  `container_id` varchar(255) DEFAULT NULL COMMENT '所属内嵌子流程节点 ID',
  `scope_id` varchar(64) DEFAULT NULL COMMENT '作用域 execution ID',
  `status` varchar(20) NOT NULL COMMENT 'ACTIVE / WAITING / COMPLETED',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_concurrent` tinyint(1) NOT NULL DEFAULT 0,
  `is_scope` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否为作用域节点（子流程 / MI 根）',
  `mi_root_id` varchar(64) DEFAULT NULL COMMENT '多实例根 execution ID',
  `mi_index` int(11) DEFAULT NULL COMMENT '多实例序号，从 0 开始',
  `called_instance_id` varchar(64) DEFAULT NULL COMMENT 'callActivity 启动的子实例 ID',
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_instance` (`instance_id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_mi_root` (`mi_root_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='执行令牌（替代 ACT_RU_EXECUTION）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_execution`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_execution` WRITE;
/*!40000 ALTER TABLE `wfe_execution` DISABLE KEYS */;
INSERT INTO `wfe_execution` VALUES
('0100b17c-8254-567d-bb4e-9526f544a286','db15967d-0195-3468-3f14-b27279a25082','d5b8567b-8fbd-9286-a35a-66c452d69e8b','ai_task_3',NULL,'d5b8567b-8fbd-9286-a35a-66c452d69e8b','COMPLETED',0,1,0,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',0,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','db15967d-0195-3468-3f14-b27279a25082',NULL,'ai_task_3',NULL,NULL,'COMPLETED',0,0,0,NULL,NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('d5b8567b-8fbd-9286-a35a-66c452d69e8b','db15967d-0195-3468-3f14-b27279a25082',NULL,'endEvent_1',NULL,NULL,'COMPLETED',0,0,0,'d5b8567b-8fbd-9286-a35a-66c452d69e8b',NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000');
/*!40000 ALTER TABLE `wfe_execution` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_process_def`
--

DROP TABLE IF EXISTS `wfe_process_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_process_def` (
  `id` varchar(64) NOT NULL COMMENT '部署版本 ID，格式 key:version:uuid（沿用 Flowable 格式）',
  `tenant_id` varchar(64) NOT NULL,
  `process_key` varchar(255) NOT NULL,
  `version` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `category_id` varchar(64) DEFAULT NULL,
  `bpmn_xml` longtext NOT NULL COMMENT '设计器产出的 BPMN XML 原文（真源，C3）',
  `model_json` longtext NOT NULL COMMENT '部署期编译产物 ProcessModel',
  `deployed_config_hash` varchar(64) DEFAULT NULL COMMENT 'BPMN XML + NodeConfig 的 SHA-256，未变化则跳过部署',
  `status` varchar(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / SUSPENDED',
  `draft_id` varchar(64) DEFAULT NULL COMMENT '来源草稿 wf_process_draft.id',
  `deployed_at` datetime(6) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `target_namespace` varchar(255) DEFAULT NULL COMMENT 'BPMN 的 targetNamespace，Flowable 把它当作 ProcessDefinition.category',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_key_version` (`tenant_id`,`process_key`,`version`),
  KEY `idx_tenant_key` (`tenant_id`,`process_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='流程定义部署版本（替代 ACT_RE_PROCDEF + ACT_RE_DEPLOYMENT）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_process_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_process_def` WRITE;
/*!40000 ALTER TABLE `wfe_process_def` DISABLE KEYS */;
INSERT INTO `wfe_process_def` VALUES
('ui_verify_flow:1:1f4f614e-f2a4-6e5f-3ee6-59d5fccd12a4','default','ui_verify_flow',1,'UI验证流程',NULL,'<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UI验证流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','{\"processKey\":\"ui_verify_flow\",\"processName\":\"UI验证流程\",\"startNodeId\":\"startEvent_1\",\"initiatorNodeId\":\"Activity_0q13unc\",\"nodes\":{\"startEvent_1\":{\"nodeId\":\"startEvent_1\",\"nodeType\":\"startEvent\",\"name\":\"开始\",\"containerId\":null,\"incoming\":[],\"outgoing\":[\"Flow_10bijim\"],\"isInitiator\":false,\"taskRole\":\"approver\"},\"Activity_0q13unc\":{\"nodeId\":\"Activity_0q13unc\",\"nodeType\":\"userTask\",\"name\":\"发起节点\",\"containerId\":null,\"incoming\":[\"Flow_10bijim\"],\"outgoing\":[\"Flow_1mkegyr\"],\"isInitiator\":true,\"taskRole\":\"initiator\",\"approval\":{\"userIds\":[],\"roleCodes\":[],\"multiMode\":\"single\"},\"assignee\":\"${initiator}\"},\"Activity_0np59ha\":{\"nodeId\":\"Activity_0np59ha\",\"nodeType\":\"userTask\",\"name\":\"\",\"containerId\":null,\"incoming\":[\"Flow_1mkegyr\"],\"outgoing\":[\"Flow_1avyfx2\"],\"isInitiator\":false,\"taskRole\":\"handler\",\"approval\":{\"userIds\":[],\"roleCodes\":[],\"multiMode\":\"single\"}},\"Activity_023htgs\":{\"nodeId\":\"Activity_023htgs\",\"nodeType\":\"userTask\",\"name\":\"\",\"containerId\":null,\"incoming\":[\"Flow_1avyfx2\"],\"outgoing\":[\"Flow_04920vf\"],\"isInitiator\":false,\"taskRole\":\"handler\",\"approval\":{\"userIds\":[],\"roleCodes\":[],\"multiMode\":\"single\"}},\"Activity_0wemnzz\":{\"nodeId\":\"Activity_0wemnzz\",\"nodeType\":\"userTask\",\"name\":\"\",\"containerId\":null,\"incoming\":[\"Flow_04920vf\"],\"outgoing\":[\"Flow_1bblzfz\"],\"isInitiator\":false,\"taskRole\":\"approver\",\"approval\":{\"userIds\":[],\"roleCodes\":[],\"multiMode\":\"single\"}},\"Event_04ffjpj\":{\"nodeId\":\"Event_04ffjpj\",\"nodeType\":\"endEvent\",\"name\":\"结束\",\"containerId\":null,\"incoming\":[\"Flow_1bblzfz\"],\"outgoing\":[],\"isInitiator\":false,\"taskRole\":\"approver\"}},\"flows\":{\"Flow_10bijim\":{\"flowId\":\"Flow_10bijim\",\"sourceId\":\"startEvent_1\",\"targetId\":\"Activity_0q13unc\",\"condition\":null,\"isDefault\":false},\"Flow_1mkegyr\":{\"flowId\":\"Flow_1mkegyr\",\"sourceId\":\"Activity_0q13unc\",\"targetId\":\"Activity_0np59ha\",\"condition\":null,\"isDefault\":false},\"Flow_1avyfx2\":{\"flowId\":\"Flow_1avyfx2\",\"sourceId\":\"Activity_0np59ha\",\"targetId\":\"Activity_023htgs\",\"condition\":null,\"isDefault\":false},\"Flow_04920vf\":{\"flowId\":\"Flow_04920vf\",\"sourceId\":\"Activity_023htgs\",\"targetId\":\"Activity_0wemnzz\",\"condition\":null,\"isDefault\":false},\"Flow_1bblzfz\":{\"flowId\":\"Flow_1bblzfz\",\"sourceId\":\"Activity_0wemnzz\",\"targetId\":\"Event_04ffjpj\",\"condition\":null,\"isDefault\":false}},\"containers\":{}}','041b3974db57dece93836aedb001faf160851101f5364cecf304c70fedb108fd','ACTIVE','f50d6d7a012aea6df8710a35de24b267','2026-09-30 02:06:19.081000','2026-09-30 02:06:19.081000','2026-09-30 02:06:19.081000','http://flowable.org/bpmn');
/*!40000 ALTER TABLE `wfe_process_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_process_instance`
--

DROP TABLE IF EXISTS `wfe_process_instance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_process_instance` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `process_def_id` varchar(64) NOT NULL,
  `process_key` varchar(255) NOT NULL,
  `process_name` varchar(255) DEFAULT NULL,
  `business_key` varchar(255) DEFAULT NULL,
  `status` varchar(20) NOT NULL COMMENT 'RUNNING / SUSPENDED / COMPLETED / TERMINATED',
  `initiator` varchar(64) DEFAULT NULL COMMENT '发起人用户 ID',
  `parent_instance_id` varchar(64) DEFAULT NULL COMMENT 'callActivity 父实例 ID',
  `parent_node_id` varchar(255) DEFAULT NULL COMMENT '父实例中的 callActivity 节点 ID',
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `delete_reason` varchar(512) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `lock_version` bigint(20) NOT NULL DEFAULT 0 COMMENT '乐观锁版本：每次整份运行时行重写 +1；落库前 CAS 校验（对齐 Flowable 的 REV_）',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_status` (`tenant_id`,`status`),
  KEY `idx_tenant_initiator` (`tenant_id`,`initiator`),
  KEY `idx_parent` (`parent_instance_id`),
  KEY `idx_def` (`process_def_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='流程实例（替代 ACT_RU_EXECUTION 根 + ACT_HI_PROCINST）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_process_instance`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_process_instance` WRITE;
/*!40000 ALTER TABLE `wfe_process_instance` DISABLE KEYS */;
INSERT INTO `wfe_process_instance` VALUES
('db15967d-0195-3468-3f14-b27279a25082','default','dual_node_e2e:1:3ebcb471-2a66-232f-1ba6-3eae0ac0fb9f','dual_node_e2e','双类型节点E2E流程',NULL,'COMPLETED','1',NULL,NULL,'2026-09-27 18:50:15.173000','2026-09-27 18:53:32.478000',NULL,'2026-09-27 18:50:15.173000','2026-09-27 18:53:32.478000',3);
/*!40000 ALTER TABLE `wfe_process_instance` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_task`
--

DROP TABLE IF EXISTS `wfe_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_task` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `execution_id` varchar(64) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL COMMENT 'BPMN 元素 ID，等价 taskDefinitionKey',
  `activity_instance_id` varchar(64) DEFAULT NULL COMMENT 'FK → wfe_activity.id',
  `name` varchar(255) DEFAULT NULL,
  `assignee` varchar(64) DEFAULT NULL,
  `status` varchar(20) NOT NULL COMMENT 'CREATED / CLAIMED / COMPLETED / CANCELLED',
  `create_time` datetime(6) NOT NULL,
  `claim_time` datetime(6) DEFAULT NULL,
  `end_time` datetime(6) DEFAULT NULL,
  `due_date` datetime(6) DEFAULT NULL,
  `mi_index` int(11) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_assignee_status` (`tenant_id`,`assignee`,`status`),
  KEY `idx_instance_status` (`instance_id`,`status`),
  KEY `idx_instance_node` (`instance_id`,`node_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='任务（待办+已办统一，替代 ACT_RU_TASK + ACT_HI_TASKINST）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_task`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_task` WRITE;
/*!40000 ALTER TABLE `wfe_task` DISABLE KEYS */;
INSERT INTO `wfe_task` VALUES
('28b5adad-7c5a-f40a-e1ee-df7faa5f74ca','default','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','ai_task_2',NULL,NULL,'1','COMPLETED','2026-09-27 18:50:15.184000',NULL,'2026-09-27 18:51:22.060000',NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('c453e067-ab35-5315-0dd3-7625a5458bd6','default','db15967d-0195-3468-3f14-b27279a25082','0100b17c-8254-567d-bb4e-9526f544a286','ai_task_3',NULL,NULL,'1','COMPLETED','2026-09-27 18:51:22.066000',NULL,'2026-09-27 18:53:32.472000',NULL,0,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000'),
('db37eb61-71a8-7476-fa55-6ebfface00bd','default','db15967d-0195-3468-3f14-b27279a25082','6f4e2c3b-5e2a-eaaa-2e7e-08107c5b8f8f','ai_task_1',NULL,NULL,'1','COMPLETED','2026-09-27 18:50:15.178000',NULL,'2026-09-27 18:50:15.179000',NULL,NULL,'2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000');
/*!40000 ALTER TABLE `wfe_task` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_task_candidate`
--

DROP TABLE IF EXISTS `wfe_task_candidate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_task_candidate` (
  `id` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`,`user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='任务候选人（替代 ACT_RU_IDENTITYLINK）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_task_candidate`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_task_candidate` WRITE;
/*!40000 ALTER TABLE `wfe_task_candidate` DISABLE KEYS */;
/*!40000 ALTER TABLE `wfe_task_candidate` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_task_delegation`
--

DROP TABLE IF EXISTS `wfe_task_delegation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_task_delegation` (
  `task_id` varchar(64) NOT NULL COMMENT '任务 ID（一个任务至多一条）',
  `instance_id` varchar(64) NOT NULL COMMENT '流程实例 ID（便于按实例清理）',
  `tenant_id` varchar(64) NOT NULL,
  `owner` varchar(64) DEFAULT NULL COMMENT '原办理人：委派时从 assignee 抄下，resolve 时还回去',
  `delegation_state` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING（已委派）/ RESOLVED（已交还）',
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_delegation_instance` (`instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务委派状态（owner + 委派态）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_task_delegation`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_task_delegation` WRITE;
/*!40000 ALTER TABLE `wfe_task_delegation` DISABLE KEYS */;
/*!40000 ALTER TABLE `wfe_task_delegation` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wfe_variable`
--

DROP TABLE IF EXISTS `wfe_variable`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wfe_variable` (
  `id` varchar(64) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `execution_id` varchar(64) DEFAULT NULL,
  `scope_id` varchar(64) DEFAULT NULL COMMENT '实例级变量存空字符串，不可为 NULL',
  `name` varchar(255) NOT NULL,
  `type` varchar(32) NOT NULL COMMENT 'string / number / boolean / json / date',
  `value_json` longtext DEFAULT NULL,
  `create_time` datetime(6) NOT NULL,
  `update_time` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_instance_scope_name` (`instance_id`,`scope_id`,`name`),
  KEY `idx_instance_name` (`instance_id`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci COMMENT='流程变量（替代 ACT_RU_VARIABLE + ACT_HI_VARINST）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wfe_variable`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wfe_variable` WRITE;
/*!40000 ALTER TABLE `wfe_variable` DISABLE KEYS */;
INSERT INTO `wfe_variable` VALUES
('db15967d-0195-3468-3f14-b27279a25082_initiator','db15967d-0195-3468-3f14-b27279a25082',NULL,'','initiator','string','\"1\"','2026-09-27 18:53:32.473000','2026-09-27 18:53:32.473000');
/*!40000 ALTER TABLE `wfe_variable` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-10-09 17:05:08
